import { defaultValidationConfig } from "../invoices/validation.ts";

type DiField = {
  content?: string;
  confidence?: number;
  valueString?: string;
  valueDate?: string;
  boundingRegions?: Array<{ pageNumber?: number; polygon?: number[] }>;
};

const DIAGNOSED = { recipientName: "CustomerName", recipientTaxId: "CustomerTaxId", invoiceDate: "InvoiceDate" } as const;
const MAX_VALUE_CHARS = 120;

export type FieldDiagnostic = {
  field: keyof typeof DIAGNOSED;
  value: string | null;
  confidence: number | null;
  page: number | null;
  polygon: number[] | null;
};

/** Emits only the five approved diagnostic properties for deficient target fields. */
export function diagnoseFields(fields: Record<string, DiField> | undefined): FieldDiagnostic[] {
  const result: FieldDiagnostic[] = [];
  for (const [field, source] of Object.entries(DIAGNOSED) as Array<[keyof typeof DIAGNOSED, string]>) {
    const raw = fields?.[source];
    const value = (raw?.valueString ?? raw?.valueDate ?? raw?.content)?.slice(0, MAX_VALUE_CHARS);
    const confidence = typeof raw?.confidence === "number" ? raw.confidence : undefined;
    const threshold = defaultValidationConfig.minimumConfidenceByField?.[field] ?? defaultValidationConfig.minimumConfidence;
    if (value && confidence !== undefined && confidence >= threshold) continue;
    const region = raw?.boundingRegions?.[0];
    result.push({ field, value: value ?? null, confidence: confidence ?? null, page: region?.pageNumber ?? null, polygon: region?.polygon ?? null });
  }
  return result;
}
