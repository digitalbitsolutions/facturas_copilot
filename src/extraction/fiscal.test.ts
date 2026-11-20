import assert from "node:assert/strict";
import test from "node:test";
import { DENTALIS_PAGE3_DUMP } from "./fixtures-dentalis.ts";
import { extractFiscal, formatCents, parseAmount, parseRateBp, vatRateSlots, type DiAnalyzeResult } from "./fiscal.ts";

const expected = { baseTotal: 291735, vatTotal: 59585, grossTotal: 351320 };
const resultFromDump = (options: { tables?: boolean; words?: boolean; corrupt?: boolean } = {}): DiAnalyzeResult => {
  const { tables = true, words = true, corrupt = false } = options;
  const fix = (value: string) => corrupt ? value.replace("€", "�") : value;
  return {
    ...(tables ? { tables: [{
      rowCount: DENTALIS_PAGE3_DUMP.rowCount,
      columnCount: DENTALIS_PAGE3_DUMP.columnCount,
      cells: DENTALIS_PAGE3_DUMP.cells.map((cell) => ({ rowIndex: cell.row, columnIndex: cell.col, kind: cell.kind, content: fix(cell.content) })),
    }] } : {}),
    ...(words ? { pages: [{ pageNumber: 3, words: DENTALIS_PAGE3_DUMP.wordsInside.map((word) => ({ ...word, content: fix(word.content) })) }] } : {}),
  };
};
const assertDentalis = (result: ReturnType<typeof extractFiscal>) => {
  assert.ok(result.ok, result.ok ? "" : result.errors.join(" | "));
  if (result.ok) assert.deepEqual(
    { baseTotal: result.summary.baseTotal, vatTotal: result.summary.vatTotal, grossTotal: result.summary.grossTotal },
    expected,
  );
};

const checks: Array<[string, () => void]> = [
  ["parseAmount convierte importe español", () => assert.equal(parseAmount("2.917,35"), 291735)],
  ["parseAmount conserva negativo", () => assert.equal(parseAmount("-1.000,00"), -100000)],
  ["parseAmount admite euro", () => assert.equal(parseAmount("3.513,20 €"), 351320)],
  ["parseAmount admite U+FFFD", () => assert.equal(parseAmount("3.513,20 �"), 351320)],
  ["parseAmount rechaza dólares", () => assert.equal(parseAmount("3.513,20 $"), null)],
  ["parseAmount rechaza punto decimal", () => assert.equal(parseAmount("2917.35"), null)],
  ["parseAmount exige dos decimales", () => assert.equal(parseAmount("12,5"), null)],
  ["parseRateBp analiza 21 %", () => assert.equal(parseRateBp("21 %"), 2100)],
  ["parseRateBp analiza 10,00", () => assert.equal(parseRateBp("10,00"), 1000)],
  ["parseRateBp rechaza texto", () => assert.equal(parseRateBp("IVA"), null)],
  ["formatCents conserva separadores", () => assert.equal(formatCents(291735), "2.917,35")],
  ["DENTALIS tabla y palabras valida", () => assertDentalis(extractFiscal(resultFromDump()))],
  ["DENTALIS solo tabla valida", () => assertDentalis(extractFiscal(resultFromDump({ words: false })))],
  ["DENTALIS solo palabras valida", () => assertDentalis(extractFiscal(resultFromDump({ tables: false })))],
  ["DENTALIS con U+FFFD valida", () => assertDentalis(extractFiscal(resultFromDump({ corrupt: true })))],
  ["DENTALIS tiene dos tipos de IVA", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.rows.length, 2); }],
  ["DENTALIS base es 291735", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.baseTotal, 291735); }],
  ["DENTALIS IVA es 59585", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.vatTotal, 59585); }],
  ["DENTALIS total es 351320", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.grossTotal, 351320); }],
  ["DENTALIS tabla es la fuente preferida", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.source, "table"); }],
  ["total de cabecera correcto valida", () => assertDentalis(extractFiscal(resultFromDump(), { headerTotal: 351320 }))],
  ["total de cabecera incorrecto rechaza", () => assert.equal(extractFiscal(resultFromDump(), { headerTotal: 351420 }).ok, false)],
  ["sin fuentes fiscales rechaza", () => assert.equal(extractFiscal({}).ok, false)],
  ["tasa de IVA no permitida rechaza", () => assert.equal(extractFiscal({ tables: [{ rowCount: 2, columnCount: 3, cells: [{ rowIndex: 0, columnIndex: 0, content: "Base" }, { rowIndex: 0, columnIndex: 1, content: "% IVA" }, { rowIndex: 0, columnIndex: 2, content: "Imp. IVA" }, { rowIndex: 1, columnIndex: 0, content: "100,00" }, { rowIndex: 1, columnIndex: 1, content: "17 %" }, { rowIndex: 1, columnIndex: 2, content: "17,00" }] }] }).ok, false)],
  ["IVA incoherente rechaza", () => assert.equal(extractFiscal({ tables: [{ rowCount: 2, columnCount: 3, cells: [{ rowIndex: 0, columnIndex: 0, content: "Base" }, { rowIndex: 0, columnIndex: 1, content: "% IVA" }, { rowIndex: 0, columnIndex: 2, content: "Imp. IVA" }, { rowIndex: 1, columnIndex: 0, content: "100,00" }, { rowIndex: 1, columnIndex: 1, content: "21 %" }, { rowIndex: 1, columnIndex: 2, content: "99,00" }] }] }).ok, false)],
  ["símbolo aislado en datos se anexa al importe", () => assertDentalis(extractFiscal(resultFromDump({ tables: false, corrupt: true })))],
  ["las dos rutas coinciden sin aviso", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.warnings.length, 0); }],
  ["la ruta de palabras informa origen", () => { const r = extractFiscal(resultFromDump({ tables: false })); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.source, "words"); }],
  ["la fila 21 % conserva cuota", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.rows.find((row) => row.rateBp === 2100)?.vat, 58059); }],
  ["la fila 10 % conserva cuota", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.rows.find((row) => row.rateBp === 1000)?.vat, 1526); }],
  ["la tabla contiene base de ambos tipos", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.deepEqual(r.summary.rows.map((row) => row.base).sort((a, b) => a - b), [15262, 276473]); }],
  ["los tipos de IVA ocupan tres huecos y los no usados quedan a cero", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.deepEqual(vatRateSlots(r.summary.rows), [21, 10, 0]); }],
  ["más de tres tipos de IVA no se truncan silenciosamente", () => assert.throws(() => vatRateSlots([{ base: 1, rateBp: 2100, vat: 0 }, { base: 1, rateBp: 1000, vat: 0 }, { base: 1, rateBp: 500, vat: 0 }, { base: 1, rateBp: 400, vat: 0 }]), /more than three/)],
  ["el total coincide con base más IVA", () => { const r = extractFiscal(resultFromDump()); assert.ok(r.ok); if (r.ok) assert.equal(r.summary.baseTotal + r.summary.vatTotal, r.summary.grossTotal); }],
];

assert.equal(checks.length, 34);
for (const [name, check] of checks) test(name, check);
