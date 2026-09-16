import XlsxPopulate from "xlsx-populate";
import { PAYMENT_FORECAST_COLUMNS, type PaymentForecastRow } from "./types.ts";

const DATE_COLUMNS = new Set(["FechaFactura", "FechaVencimiento", "FechaPagoPrevista"]);

function excelDate(value: unknown): unknown {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  const epoch = Date.UTC(1899, 11, 30);
  return new Date(epoch + Math.round(value * 86_400_000)).toISOString().slice(0, 10);
}

/** Reads only the named import sheet; excluded rows can never enter the import. */
export async function parsePaymentForecastFile(name: string, content: ArrayBuffer): Promise<PaymentForecastRow[]> {
  if (!/\.xlsx$/i.test(name)) throw new Error("Only .xlsx payment forecast files are supported");
  const workbook = await XlsxPopulate.fromDataAsync(Buffer.from(content));
  const sheet = workbook.sheet("PrevisionPagos");
  if (!sheet) throw new Error("The workbook does not contain the 'PrevisionPagos' worksheet");
  const values = sheet.usedRange().value() as unknown[][];
  const [headings = [], ...rows] = values;
  const headers = headings.map((heading) => String(heading ?? "").trim());
  const missing = PAYMENT_FORECAST_COLUMNS.filter((column) => !headers.includes(column));
  if (missing.length) throw new Error(`Missing payment forecast columns: ${missing.join(", ")}`);
  return rows.filter((row) => row.some((value) => value !== undefined && value !== null && value !== "")).map((row) => Object.fromEntries(
    PAYMENT_FORECAST_COLUMNS.map((column) => {
      const value = row[headers.indexOf(column)] ?? "";
      return [column, DATE_COLUMNS.has(column) ? excelDate(value) : value];
    }),
  ) as PaymentForecastRow);
}
