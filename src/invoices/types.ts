export type VatRateSlots = readonly [number, number, number];

export type InvoiceField = Exclude<keyof ExtractedInvoice, "lines" | "dueDateStatus" | "vatRateSlots" | "irpfRate">;
export type ExtractionConfidence = Partial<Record<InvoiceField, number>>;

export type InvoiceLine = {
  description: string;
  quantity?: string;
  unitPrice?: string;
  amount?: string;
};

/** Whether the source document explicitly stated a due date. */
export type DueDateStatus = "present" | "not_stated";

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
  dueDateStatus?: DueDateStatus;
  taxableBase?: string;
  vatAmount?: string;
  /** Retention amount as stated in the document. It is normally negative. */
  irpfAmount?: string;
  /** IRPF/withholding rate, expressed as a percentage. */
  irpfRate?: number;
  /** Up to three fiscal VAT rates, expressed as percentages. Zero means the slot does not apply. */
  vatRateSlots?: VatRateSlots;
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

/** Provenance for a field completed after Document Intelligence extraction. */
export type FieldSource = "text_fallback" | "master_match";
export type FieldSources = Partial<Record<InvoiceField, FieldSource>>;
export type FieldAuditEntry = {
  field: "recipientName" | "recipientTaxId" | "invoiceDate" | "dueDate";
  fieldSource: "text_fallback";
  rule: "recipient_nif_name_proximity_v1" | "invoice_date_labelled_v1" | "invoice_date_place_date_v1" | "due_date_labelled_v1";
  evidence: Array<{ line: number; text: string }>;
  previous?: { value?: string; confidence?: number };
};

export type ValidationIssue = {
  code: "required" | "invalid_date" | "invalid_amount" | "invalid_currency" | "low_confidence" | "amount_mismatch" | "supplier_not_found" | "supplier_ambiguous" | "recipient_not_found" | "recipient_ambiguous";
  field: keyof ExtractedInvoice;
  message: string;
};

export type ValidatedInvoice = Required<Pick<ExtractedInvoice,
  "supplierName" | "invoiceNumber" | "invoiceDate" | "taxableBase" | "vatAmount" | "totalAmount"
>> & Pick<ExtractedInvoice, "dueDate" | "dueDateStatus" | "currency" | "supplierTaxId" | "recipientName" | "recipientTaxId" | "lines" | "vatRateSlots" | "irpfAmount" | "irpfRate">;

export type InvoiceValidationResult =
  | { valid: true; invoice: ValidatedInvoice; issues: [] }
  | { valid: false; issues: ValidationIssue[] };
