import type { BankImportConfig, BankImportIssue, BankImportResult, BankMovement } from "./types.ts";
import { normalizeCurrency, normalizeDate, normalizeText, parseMoneyMinor, stableHash } from "./normalization.ts";
type BankRow = Record<string, unknown>;

export function importBankRows(input: {
  sourceFilename: string;
  sourceHash: string;
  rows: BankRow[];
  config: BankImportConfig;
  knownFingerprints?: ReadonlySet<string>;
  importedAt?: string;
}): BankImportResult {
  const batchId = stableHash(input.sourceHash, input.config.schemaVersion);
  const issues: BankImportIssue[] = [];
  const requiredColumns = [input.config.columns.bookingDate, input.config.columns.description, input.config.columns.amount];
  const headers = new Set(input.rows.flatMap((row) => Object.keys(row)));
  for (const column of requiredColumns) {
    if (!headers.has(column)) issues.push({ code: "missing_column", column, message: `Required column '${column}' is missing` });
  }
  if (issues.length) return { accepted: false, batchId, issues };

  const movements: BankMovement[] = [];
  const seen = new Set<string>();
  input.rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const date = normalizeDate(row[input.config.columns.bookingDate]);
    const amount = parseMoneyMinor(row[input.config.columns.amount]);
    const currency = normalizeCurrency(input.config.columns.currency ? row[input.config.columns.currency] : undefined, input.config.defaultCurrency);
    if (!date) issues.push({ code: "invalid_date", row: rowNumber, column: input.config.columns.bookingDate, message: "Invalid booking date" });
    if (amount === undefined) issues.push({ code: "invalid_amount", row: rowNumber, column: input.config.columns.amount, message: "Invalid amount" });
    if (!currency) issues.push({ code: "invalid_currency", row: rowNumber, column: input.config.columns.currency, message: "Missing or invalid ISO currency" });
    if (!date || amount === undefined || !currency) return;

    const signedAmount = input.config.debitSign === "negative" ? -Math.abs(amount) : Math.abs(amount);
    const description = String(row[input.config.columns.description] ?? "").trim();
    const sourceId = input.config.columns.id ? String(row[input.config.columns.id] ?? "").trim() || undefined : undefined;
    const reference = input.config.columns.reference ? String(row[input.config.columns.reference] ?? "").trim() || undefined : undefined;
    const fingerprint = stableHash(sourceId ?? "", date, String(signedAmount), currency, normalizeText(description), normalizeText(reference ?? ""));
    if (seen.has(fingerprint) || input.knownFingerprints?.has(fingerprint)) {
      issues.push({ code: "duplicate_movement", row: rowNumber, message: "Movement was already present in this or a previous batch" });
      return;
    }
    seen.add(fingerprint);
    movements.push({
      movementId: stableHash(batchId, fingerprint), batchId, sourceRow: rowNumber, sourceId,
      bookingDate: date,
      valueDate: input.config.columns.valueDate ? normalizeDate(row[input.config.columns.valueDate]) : undefined,
      descriptionOriginal: description,
      descriptionNormalized: normalizeText(description),
      amountMinor: signedAmount,
      currency,
      reference,
      counterparty: input.config.columns.counterparty ? String(row[input.config.columns.counterparty] ?? "").trim() || undefined : undefined,
      fingerprint,
    });
  });

  const blocking = issues.some((issue) => issue.code !== "duplicate_movement");
  if (blocking) return { accepted: false, batchId, issues };
  return {
    accepted: true,
    batch: {
      batchId, sourceFilename: input.sourceFilename, sourceHash: input.sourceHash,
      schemaVersion: input.config.schemaVersion, importedAt: input.importedAt ?? new Date().toISOString(),
      rowCount: input.rows.length, movements,
    },
    issues,
  };
}
