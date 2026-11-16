export type ExtractionConfidence = Partial<Record<keyof ExtractedInvoice, number>>;

export type ExtractedInvoice = {
  supplierName?: string;
  supplierTaxId?: string;
  recipientName?: string;
  recipientTaxId?: string;
  /** Human-approved business area; never inferred from the supplier or PDF text alone. */
  area?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  dueDate?: string;
  taxableBase?: string;
  vatAmount?: string;
  totalAmount?: string;
  currency?: string;
};

export type InvoiceValidationConfig = {
  dueDateRequired: boolean;
  currencyRequired: boolean;
  minimumConfidence: number;
  minimumConfidenceByField?: Partial<Record<keyof ExtractedInvoice, number>>;
  amountToleranceMinorUnits: number;
};

export type ValidationIssue = {
  code: "required" | "invalid_date" | "invalid_amount" | "invalid_currency" | "low_confidence" | "amount_mismatch" | "supplier_not_found" | "supplier_ambiguous" | "recipient_not_found" | "recipient_ambiguous";
  field: keyof ExtractedInvoice;
  message: string;
};

export type ValidatedInvoice = Required<Pick<ExtractedInvoice,
  "supplierName" | "invoiceNumber" | "invoiceDate" | "taxableBase" | "vatAmount" | "totalAmount"
>> & Pick<ExtractedInvoice, "dueDate" | "currency" | "supplierTaxId" | "recipientName" | "recipientTaxId" | "area">;

export type InvoiceValidationResult =
  | { valid: true; invoice: ValidatedInvoice; issues: [] }
  | { valid: false; issues: ValidationIssue[] };
