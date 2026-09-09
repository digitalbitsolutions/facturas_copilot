import assert from "node:assert/strict";
import test from "node:test";
import XlsxPopulate from "xlsx-populate";
import { parseBankFile } from "./bank-poller.ts";

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
