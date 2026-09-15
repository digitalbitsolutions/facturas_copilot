import assert from "node:assert/strict";
import test from "node:test";
import XlsxPopulate from "xlsx-populate";
import { bankImportConfigForProfile, parseBankFile } from "./bank-poller.ts";

test("parseBankFile reads the first worksheet and its headings", async () => {
  const book = await XlsxPopulate.fromBlankAsync();
  book.sheet(0).cell("A1").value([["FechaMovimiento", "Concepto", "Importe", "Moneda"], ["01/09/2026", "Cuota", "12,50", "EUR"]]);
  const content = await book.outputAsync();
  assert.deepEqual(await parseBankFile("extracto.xlsx", content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)), [
    { FechaMovimiento: "01/09/2026", Concepto: "Cuota", Importe: "12,50", Moneda: "EUR" },
  ]);
});

test("parseBankFile rejects unsupported bank formats", async () => {
  await assert.rejects(() => parseBankFile("extracto.pdf", new ArrayBuffer(0)), /Only/);
});

test("parseBankFile keeps commas inside quoted CSV fields", async () => {
  const content = Buffer.from('fecha_operacion,concepto,importe\n2026-09-12,"ADEUDO, FACTURA P26",-387.19\n');
  assert.deepEqual(await parseBankFile("extracto.csv", content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)), [
    { fecha_operacion: "2026-09-12", concepto: "ADEUDO, FACTURA P26", importe: "-387.19" },
  ]);
});

test("selects the versioned signed CSV profile and rejects unknown versions", () => {
  const profile = bankImportConfigForProfile("bankinter-simulated-csv-v1");
  assert.equal(profile.debitSign, "preserve");
  assert.equal(profile.columns.bookingDate, "fecha_operacion");
  assert.throws(() => bankImportConfigForProfile("unknown-v1"), /Unsupported BANK_IMPORT_PROFILE/);
});
