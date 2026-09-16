import assert from "node:assert/strict";
import test from "node:test";
import XlsxPopulate from "xlsx-populate";
import { importPaymentForecastRows, parsePaymentForecastFile } from "./index.ts";

const headers = ["PrevisionId", "NumeroFactura", "Proveedor", "NIFProveedor", "FechaFactura", "FechaVencimiento", "ImporteFactura", "Moneda", "FechaPagoPrevista", "ImportePagoPrevisto", "EstadoPrevision", "ReferenciaPago", "MetodoPago", "Observaciones", "FuenteDocumento", "ConfianzaExtraccion", "RequiereRevision"];
const sourceRows = [
  ["PREV-0001", "SF 198033", "SATINFO SL", "B60310356", 46226, 46257, 200.86, "EUR", 46257, 200.86, "Pendiente", "SF 198033", "Recibo", "Pendiente de conciliación contra extracto bancario", "FASF198033-satinfo.pdf", "Alta", "No"],
  ["PREV-0003", "P26CON037623604", "Endesa Energía, S.A. Unipersonal", "A81948077", 46270, 46277, 387.21, "EUR", 46277, 387.21, "Pendiente", "P26CON037623604", "Domiciliación bancaria", "Pendiente de conciliación contra extracto bancario", "FA-endesa.pdf", "Alta", "Sí"],
];

async function compatibleWorkbook(): Promise<ArrayBuffer> {
  const workbook = await XlsxPopulate.fromBlankAsync();
  workbook.sheet(0).name("PrevisionPagos");
  workbook.sheet("PrevisionPagos").cell("A1").value([headers, ...sourceRows]);
  workbook.addSheet("Resumen");
  workbook.addSheet("Excluidas");
  const output = await workbook.outputAsync();
  return output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength);
}

test("parses the approved compatible payment forecast workbook without importing excluded rows", async () => {
  const rows = await parsePaymentForecastFile("Prevision_Pagos_importacion_compatible.xlsx", await compatibleWorkbook());
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.PrevisionId), ["PREV-0001", "PREV-0003"]);
  assert.equal(rows[1]?.RequiereRevision, "Sí");
  assert.equal(rows[0]?.FechaFactura, "2026-07-23");
});

test("imports forecasts idempotently and never promotes them to paid", async () => {
  const rows = await parsePaymentForecastFile("prevision.xlsx", await compatibleWorkbook());
  const first = importPaymentForecastRows({ sourceFilename: "prevision.xlsx", sourceHash: "source-v1", rows, importedAt: "2026-09-16T20:00:00.000Z" });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.batch.forecasts.length, 2);
  assert.equal(first.batch.forecasts.reduce((sum, forecast) => sum + forecast.plannedPaymentAmountMinor, 0), 58_807);
  assert.equal(first.batch.forecasts.every((forecast) => forecast.status !== "Pagado"), true);
  const replay = importPaymentForecastRows({ sourceFilename: "prevision.xlsx", sourceHash: "source-v2", rows, knownForecastKeys: new Set(first.batch.forecasts.map((forecast) => forecast.forecastKey)) });
  assert.equal(replay.accepted, true);
  if (replay.accepted) {
    assert.equal(replay.batch.forecasts.length, 0);
    assert.equal(replay.issues.filter((issue) => issue.code === "duplicate_forecast").length, 2);
  }
});
