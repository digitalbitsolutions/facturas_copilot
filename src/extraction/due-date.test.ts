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

if (failed) { console.error(`\n${failed} test(s) fallaron`); process.exit(1); }
console.log("\nTodos los tests pasaron");
