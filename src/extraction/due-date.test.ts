import assert from "node:assert/strict";
import { decideDueDate, DUE_DATE_MIN_CONFIDENCE } from "./due-date.ts";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log("ok   " + name); }
  catch (e) { failed++; console.error("FAIL " + name + "\n", e); }
}

// Extracto de la factura Esclatoil (una página = una factura); sin datos personales.
const ESCLATOIL = `BON PREU SAU
Núm. intern factura Data factura Divisa Ports Data valor
VEB-26452129 10/11/2026 EUR Pagats 10/11/2026
Notes
GASOLINA S/PLOM 95 1 LT LITRES
TOTAL TARGETA
Impostos Descripció impost Percentatge Base imposable Quota Total
IVA 10 % reduït 10,00 55,00 5,50 60,50
Total factura 60,50
Pàgina 1 - 1`;

const DENTALIS_LIKE = `Forma de pago: 6 VENCIMIENTOS Doc. de pago: Giro domiciliado
Vencimientos: 16/11/2026 1.082,08 €`;

check("umbral sigue en 0,65", () => assert.equal(DUE_DATE_MIN_CONFIDENCE, 0.65));

check("Esclatoil: 'Data valor' leída con baja confianza -> not_stated (valor descartado)", () => {
  const r = decideDueDate({ value: "2026-11-10", content: "10/11/2026", confidence: 0.5 }, ESCLATOIL);
  assert.deepEqual(r, { status: "not_stated" });
});
check("Esclatoil sin campo dueDate -> not_stated", () => {
  assert.deepEqual(decideDueDate(undefined, ESCLATOIL), { status: "not_stated" });
  assert.deepEqual(decideDueDate({ value: null, confidence: null }, ESCLATOIL), { status: "not_stated" });
});
check("confianza suficiente -> ok sin cambios", () => {
  const r = decideDueDate({ value: "2026-12-10", confidence: 0.9 }, ESCLATOIL);
  assert.deepEqual(r, { status: "ok", dueDate: "2026-12-10", confidence: 0.9 });
});
check("frontera: 0,65 pasa; 0,6499 no", () => {
  assert.equal(decideDueDate({ value: "2026-12-10", confidence: 0.65 }, ESCLATOIL).status, "ok");
  assert.equal(decideDueDate({ value: "2026-12-10", confidence: 0.6499 }, ESCLATOIL).status, "not_stated");
});
check("documento con vencimientos y confianza baja -> review", () => {
  const r = decideDueDate({ value: "2026-11-16", confidence: 0.4 }, DENTALIS_LIKE);
  assert.deepEqual(r, { status: "review", reason: "due_date_indicators_present_but_unverified" });
});
check("documento con vencimientos y sin campo -> review", () => {
  assert.equal(decideDueDate(null, DENTALIS_LIKE).status, "review");
});
check("indicios en es/ca/en, con mayúsculas y acentos", () => {
  for (const t of ["Data de VENCIMENT: 10/12/2026", "Vto. 10/12/2026", "Due date: 2026-12-10", "Pagadero a 30 días fecha factura", "Condicions de pagament: 30 dies data"]) {
    assert.equal(decideDueDate({ value: "2026-12-10", confidence: 0.3 }, t).status, "review", t);
  }
});
check("'Pagats', 'Data valor' y 'cobrament' NO cuentan como indicio de vencimiento", () => {
  assert.equal(decideDueDate({ value: "2026-11-10", confidence: 0.3 }, "Ports Pagats Data valor 10/11/2026 Adreça de cobrament").status, "not_stated");
});
check("un número seguido de dies sin condición de pago no es vencimiento", () => {
  assert.equal(decideDueDate({ value: "2026-11-19", confidence: 0.3 }, "Serveis realitzats durant 15 dies").status, "not_stated");
});

check("los datos bancarios de pago no son un vencimiento", () => {
  const r = decideDueDate({ value: "2026-11-19", confidence: 0.3 }, "Dades de pagament:\nData de pagament: 19/11/2026\nTitular: Professional\nIBAN: ES73 0081 4291 6000 1374 4140");
  assert.deepEqual(r, { status: "not_stated" });
});

check("variantes OCR del encabezado bancario no son un vencimiento", () => {
  for (const text of ["Dades pagament: Titular\nIBAN: ES73 0081 4291 6000 1374 4140", "Datos bancarios de pago: Titular\nIBAN: ES73 0081 4291 6000 1374 4140"]) {
    assert.equal(decideDueDate({ value: "2026-11-19", confidence: 0.3 }, text).status, "not_stated", text);
  }
});

check("una cabecera de forma de pago junto al IBAN no es un vencimiento", () => {
  const r = decideDueDate({ value: "2026-11-19", confidence: 0.3 }, "Forma de pagament:\nTitular: Professional\nIBAN: ES73 0081 4291 6000 1374 4140");
  assert.deepEqual(r, { status: "not_stated" });
});

check("una cabecera aislada de forma de pago con IBAN no oculta un plazo real", () => {
  assert.equal(decideDueDate({ value: "2026-11-19", confidence: 0.3 }, "Forma de pago: 30 días\nIBAN: ES73 0081 4291 6000 1374 4140").status, "review");
  assert.equal(decideDueDate({ value: "2026-11-19", confidence: 0.3 }, "Forma de pagament\nIBAN: ES73 0081 4291 6000 1374 4140").status, "not_stated");
});

const GUIMAR_PAYMENT = "FORMA DE PAGO: Transf_contado";
const BANK_ACCOUNT_LABEL = "CUENTA BANCARIA: [omitida]";
const GUIMAR_FOOTER = GUIMAR_PAYMENT + "\n" + BANK_ACCOUNT_LABEL;

check("G1: pago al contado y cuenta bancaria en líneas separadas", () => {
  assert.deepEqual(decideDueDate(undefined, GUIMAR_FOOTER), { status: "not_stated" });
});

check("G2: pago al contado y cuenta bancaria en un párrafo", () => {
  assert.deepEqual(decideDueDate(undefined, GUIMAR_PAYMENT + " " + BANK_ACCOUNT_LABEL), { status: "not_stated" });
});

check("G3: la fecha de escritura con baja confianza se descarta", () => {
  const result = decideDueDate({ value: "2026-11-01", confidence: 0.4 }, "FECHA ESCRITURA: 01/11/2026\n" + GUIMAR_FOOTER);
  assert.deepEqual(result, { status: "not_stated" });
});

check("G4: un vencimiento del modelo con confianza suficiente se conserva", () => {
  const result = decideDueDate({ value: "2026-11-30", confidence: 0.9 }, GUIMAR_FOOTER);
  assert.deepEqual(result, { status: "ok", dueDate: "2026-11-30", confidence: 0.9 });
});

check("G5: vencimiento explícito con baja confianza sigue en revisión", () => {
  assert.equal(decideDueDate({ value: "2026-11-30", confidence: 0.4 }, "Vencimiento: 30/11/2026").status, "review");
});

check("G6: calendario de varios plazos de UTPR sigue en revisión", () => {
  const calendar = "Forma de pago: 6 VENCIMIENTOS\nVencimientos: 30/11/2026\n30/12/2026\nGiro domiciliado";
  assert.equal(decideDueDate(undefined, calendar).status, "review");
});

const GUIMAR_REVIEW_CASES: Array<[string, string]> = [
  ["G7: vencimiento en una línea aparte", GUIMAR_PAYMENT + "\nVencimiento: 30/11/2026"],
  ["G8: vencimiento en el mismo párrafo", GUIMAR_PAYMENT + " Vencimiento: 30/11/2026"],
  ["G9: contado con un plazo", "Forma de pago: Contado a 30 días"],
  ["G10: transferencia a plazo", "Forma de pago: Transferencia 30 días"],
  ["G11: transferencia sin indicación de contado", "Forma de pago: Transferencia bancaria"],
  ["G12: contado seguido de un sufijo", "Forma de pago: Transf_contado_30"],
];

for (const [name, text] of GUIMAR_REVIEW_CASES) {
  check(name, () => assert.equal(decideDueDate(undefined, text).status, "review"));
}

check("G13: variantes de pago al contado", () => {
  for (const text of ["Forma de pago: TRANSFERENCIA AL CONTADO", "Forma de pagament: Transf. contado"]) {
    assert.deepEqual(decideDueDate(undefined, text), { status: "not_stated" }, text);
  }
});

if (failed) { console.error(`\n${failed} test(s) fallaron`); process.exit(1); }
console.log("\nTodos los tests pasaron");
