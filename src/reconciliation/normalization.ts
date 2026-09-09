import { createHash } from "node:crypto";
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

export function normalizeCurrency(value: unknown, fallback?: string): string | undefined {
  const currency = String(value ?? fallback ?? "").trim().toUpperCase();
  return ISO_CURRENCY.test(currency) ? currency : undefined;
}

export function normalizeDate(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  let year: number;
  let month: number;
  let day: number;
  if (ISO_DATE.test(text)) {
    [year, month, day] = text.split("-").map(Number);
  } else {
    const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(text);
    if (!match) return undefined;
    day = Number(match[1]); month = Number(match[2]); year = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function parseMoneyMinor(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : undefined;
  let text = String(value ?? "").trim().replace(/\s/g, "");
  if (!text) return undefined;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()\-+€$£]/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return undefined;
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  const decimalIndex = Math.max(comma, dot);
  const hasDecimal = decimalIndex >= 0 && text.length - decimalIndex - 1 <= 2;
  const digits = text.replace(/[.,]/g, "");
  const wholeDigits = hasDecimal ? digits.slice(0, -(text.length - decimalIndex - 1)) || "0" : digits;
  const fractionDigits = hasDecimal ? digits.slice(-(text.length - decimalIndex - 1)).padEnd(2, "0") : "00";
  const minor = Number(wholeDigits) * 100 + Number(fractionDigits);
  return Number.isSafeInteger(minor) ? (negative ? -minor : minor) : undefined;
}

export function stableHash(...values: string[]): string {
  return createHash("sha256").update(values.join("\0")).digest("hex");
}
