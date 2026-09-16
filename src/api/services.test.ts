import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assignExceptionRequest, decideReconciliationRequest, importBankRequest, importPaymentForecastRequest, proposeReconciliationRequest, reconcileBankRequest, resolveExceptionRequest, validateInvoiceRequest } from "./services.ts";

describe("HTTP service contracts", () => {
  it("validates an extracted invoice payload", () => {
    const result = validateInvoiceRequest({ invoice: {
      supplierName: "ACME", invoiceNumber: "F-1", invoiceDate: "2026-09-01",
      taxableBase: "100.00", vatAmount: "21.00", totalAmount: "121.00", currency: "EUR",
    } });
    assert.equal(result.valid, true);
  });

  it("rejects malformed bank import envelopes", () => {
    assert.throws(() => importBankRequest({ rows: [] }), /sourceFilename/);
  });

  it("accepts an empty reconciliation workload", () => {
    assert.deepEqual(reconcileBankRequest({ movements: [], invoices: [] }), []);
  });

  it("rejects forecast imports that attempt to declare a payment as paid", () => {
    const result = importPaymentForecastRequest({ sourceFilename: "prevision.xlsx", sourceHash: "abc", rows: [{
      PrevisionId: "PREV-1", NumeroFactura: "F-1", Proveedor: "ACME", NIFProveedor: "B123", FechaFactura: "2026-09-01", FechaVencimiento: "2026-09-30",
      ImporteFactura: 12, Moneda: "EUR", FechaPagoPrevista: "2026-09-30", ImportePagoPrevisto: 12, EstadoPrevision: "Pagado",
      ReferenciaPago: "F-1", MetodoPago: "Transferencia", Observaciones: "", FuenteDocumento: "F-1.pdf", ConfianzaExtraccion: "Alta", RequiereRevision: "No",
    }] });
    assert.equal(result.accepted, false);
    assert.equal(result.issues[0]?.code, "paid_status_forbidden");
  });

  it("accepts only the approved resolution action for each exception code", () => {
    assert.deepEqual(resolveExceptionRequest({ exceptionId: "7", code: "EX-07", responsible: "reviewer@contoso.com", action: "confirm_duplicate", result: "Confirmed against original invoice" }).action, "confirm_duplicate");
    assert.throws(() => resolveExceptionRequest({ exceptionId: "7", code: "EX-07", responsible: "reviewer@contoso.com", action: "update_supplier_and_resubmit", result: "Invalid" }), /not allowed/);
    assert.deepEqual(assignExceptionRequest({ exceptionId: "7", responsible: "reviewer@contoso.com" }), { exceptionId: "7", responsible: "reviewer@contoso.com" });
  });

  it("requires a human-review proposal and an explicit reconciliation decision", () => {
    assert.throws(() => proposeReconciliationRequest({ proposals: [{ movementId: "m-1", classification: "high", candidates: [], requiresHumanReview: false, reason: "unsafe" }] }), /requiresHumanReview/);
    assert.deepEqual(decideReconciliationRequest({ reconciliationId: "1", responsible: "reviewer@example.test", action: "confirm_match", result: "Verified" }), {
      reconciliationId: "1", responsible: "reviewer@example.test", action: "confirm_match", result: "Verified",
    });
  });
});
