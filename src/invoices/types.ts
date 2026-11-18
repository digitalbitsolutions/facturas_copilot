export type InvoiceField = Exclude<keyof ExtractedInvoice, "lines">;
export type ExtractionConfidence = Partial<Record<InvoiceField, number>>;

export type InvoiceLine = {
  description: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
};

export type ExtractedInvoice = {
  supplierName?: string;
  supplierTaxId?: string;
  recipientName?: string;
  recipientTaxId?: string;
  /** Every extracted invoice line is retained; a single invoice may have many concepts. */
  lines?: InvoiceLine[];
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
  minimumConfidenceByField?: Partial<Record<InvoiceField, number>>;
  amountToleranceMinorUnits: number;
};

export type ValidationIssue = {
  code: "required" | "invalid_date" | "invalid_amount" | "invalid_currency" | "low_confidence" | "amount_mismatch" | "supplier_not_found" | "supplier_ambiguous" | "recipient_not_found" | "recipient_ambiguous";
  field: keyof ExtractedInvoice;
  message: string;
};

export type ValidatedInvoice = Required<Pick<ExtractedInvoice,
  "supplierName" | "invoiceNumber" | "invoiceDate" | "taxableBase" | "vatAmount" | "totalAmount"
>> & Pick<ExtractedInvoice, "dueDate" | "currency" | "supplierTaxId" | "recipientName" | "recipientTaxId" | "lines">;

export type InvoiceValidationResult =
  | { valid: true; invoice: ValidatedInvoice; issues: [] }
  | { valid: false; issues: ValidationIssue[] };
