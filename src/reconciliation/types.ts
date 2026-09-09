export type ReconciliationClassification = "high" | "probable" | "review" | "no_match";

export type BankColumnMap = {
  id?: string;
  bookingDate: string;
  valueDate?: string;
  description: string;
  amount: string;
  currency?: string;
  reference?: string;
  counterparty?: string;
};

export type BankImportConfig = {
  schemaVersion: string;
  columns: BankColumnMap;
  defaultCurrency?: string;
  debitSign: "negative" | "positive";
};

export type BankMovement = {
  movementId: string;
  batchId: string;
  sourceRow: number;
  sourceId?: string;
  bookingDate: string;
  valueDate?: string;
  descriptionOriginal: string;
  descriptionNormalized: string;
  amountMinor: number;
  currency: string;
  reference?: string;
  counterparty?: string;
  fingerprint: string;
};

export type BankImportIssue = {
  code: "missing_column" | "invalid_date" | "invalid_amount" | "invalid_currency" | "duplicate_movement";
  row?: number;
  column?: string;
  message: string;
};

export type BankImportBatch = {
  batchId: string;
  sourceFilename: string;
  sourceHash: string;
  schemaVersion: string;
  importedAt: string;
  rowCount: number;
  movements: BankMovement[];
};

export type BankImportResult =
  | { accepted: true; batch: BankImportBatch; issues: BankImportIssue[] }
  | { accepted: false; batchId: string; issues: BankImportIssue[] };

export type ReconciliationInvoice = {
  invoiceId: string;
  supplierName: string;
  supplierTaxId?: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  totalMinor: number;
  currency: string;
  outstandingMinor?: number;
};

export type ReconciliationConfig = {
  amountToleranceMinor: number;
  maximumDateDistanceDays: number;
  highThreshold: number;
  probableThreshold: number;
  reviewThreshold: number;
  ambiguityMargin: number;
  automaticAcceptanceEnabled: boolean;
};

export type MatchFactor = {
  factor: "amount" | "currency" | "reference" | "counterparty" | "date";
  points: number;
  explanation: string;
};

export type ReconciliationCandidate = {
  invoiceId: string;
  score: number;
  factors: MatchFactor[];
};

export type ReconciliationProposal = {
  movementId: string;
  classification: ReconciliationClassification;
  candidates: ReconciliationCandidate[];
  requiresHumanReview: boolean;
  reason: string;
};
