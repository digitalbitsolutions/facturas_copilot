/**
 * Extracción y validación determinista del desglose fiscal de una factura a partir
 * del JSON de Azure AI Document Intelligence (AnalyzeResult de prebuilt-layout, API 2024-11-30).
 *
 * - Sin dependencias. Importes en céntimos enteros (nunca floats).
 * - Falla cerrado: ante cualquier duda devuelve { ok: false } y el llamador NO debe registrar ni archivar.
 * - Dos vías independientes para localizar la tabla fiscal:
 *     "table": la tabla que devuelve layout (cabeceras -> columnas).
 *     "words": reconstrucción por geometría de palabras (por si el OCR devuelve texto lineal).
 *   Si ambas validan, deben coincidir; si solo una valida, se acepta con aviso.
 */

export type Cents = number;

// ---- Subconjunto del JSON de AnalyzeResult que se utiliza ----
export interface DiWord { content: string; polygon?: number[]; confidence?: number }
export interface DiPage { pageNumber: number; words?: DiWord[] }
export interface DiRegion { pageNumber: number; polygon?: number[] }
export interface DiCell {
  rowIndex: number;
  columnIndex: number;
  content?: string;
  kind?: string;
  rowSpan?: number;
  columnSpan?: number;
  boundingRegions?: DiRegion[];
}
export interface DiTable {
  rowCount: number;
  columnCount: number;
  cells: DiCell[];
  boundingRegions?: DiRegion[];
}
export interface DiAnalyzeResult { pages?: DiPage[]; tables?: DiTable[] }

// ---- Resultado ----
export interface TaxRow { base: Cents; rateBp: number; vat: Cents } // rateBp: 2100 = 21 %
export interface TaxSummary {
  rows: TaxRow[];
  baseTotal: Cents;
  vatTotal: Cents;
  grossTotal: Cents;
  source: "table" | "words";
}

/**
 * Projects a validated fiscal table into the three Excel/SharePoint VAT slots.
 * A zero is used only for an unused slot; it never replaces an unrecognised rate.
 */
export function vatRateSlots(rows: TaxRow[]): readonly [number, number, number] {
  const rates = [...new Set(rows.map((row) => row.rateBp))].sort((a, b) => b - a);
  if (rates.length > 3) throw new Error("A fiscal invoice cannot be projected into more than three VAT rate slots");
  return [rates[0] ? rates[0] / 100 : 0, rates[1] ? rates[1] / 100 : 0, rates[2] ? rates[2] / 100 : 0];
}
export type FiscalResult =
  | { ok: true; summary: TaxSummary; warnings: string[] }
  | { ok: false; errors: string[]; warnings: string[] };

export interface FiscalOptions {
  /** Tipos de IVA aceptados, en centésimas de % (2100 = 21 %). */
  allowedRatesBp?: number[];
  /** Tolerancia de redondeo por fila: |round(base*tipo) - cuota|. */
  rowToleranceCents?: number;
  /** Tolerancia de Σbases + Σcuotas contra los totales declarados. */
  totalToleranceCents?: number;
  /** Total leído por otra vía independiente (p. ej. InvoiceTotal de prebuilt-invoice). */
  headerTotal?: Cents | null;
  /** Confianza mínima por palabra (vía "words"). */
  minWordConfidence?: number;
  /** Si hay columna "Importe": exige Σbases == Importe + Portes. */
  strictGrossCheck?: boolean;
}

const DEFAULTS = {
  allowedRatesBp: [0, 400, 500, 1000, 2100],
  rowToleranceCents: 1,
  totalToleranceCents: 1,
  headerTotal: null as Cents | null,
  minWordConfidence: 0.8,
  strictGrossCheck: true,
};
type Opts = typeof DEFAULTS;

// ---- Parseo estricto de números en formato español ----
const AMOUNT_RE = /^-?(\d{1,3}(\.\d{3})+|\d+),\d{2}$/;
const RATE_RE = /^(\d{1,2})(?:,(\d{1,2}))?%?$/;

/** "2.917,35" -> 291735. Exige exactamente 2 decimales con coma; rechaza formatos ambiguos. */
export function parseAmount(raw: string): Cents | null {
  const s = raw.replace(/[€�\s]/g, "");
  if (!AMOUNT_RE.test(s)) return null;
  const neg = s.startsWith("-");
  const [int = "", dec = ""] = s.replace("-", "").split(",");
  const cents = Number(int.replace(/\./g, "")) * 100 + Number(dec);
  return neg ? -cents : cents;
}

/** "21 %" / "10,00" -> 2100 / 1000 (centésimas de %). */
export function parseRateBp(raw: string): number | null {
  const m = RATE_RE.exec(raw.replace(/\s/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function formatCents(c: Cents): string {
  const a = Math.abs(c);
  const int = Math.floor(a / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${c < 0 ? "-" : ""}${int},${String(a % 100).padStart(2, "0")}`;
}

// ---- Cabeceras ----
export type Col = "base" | "rate" | "vat" | "total" | "gross" | "shipping";

function normLabel(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}% ]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyHeader(text: string): Col | null {
  const n = normLabel(text);
  if (/^base( imponible)?$/.test(n)) return "base";
  if (/^(% ?iva|iva ?%|tipo( de)? iva|tarifa)$/.test(n)) return "rate";
  if (/^(imp|importe|cuota)( de)? iva$/.test(n) || n === "cuota") return "vat";
  if (/^total( factura)?$/.test(n)) return "total";
  if (n === "importe") return "gross";
  if (n === "portes") return "shipping";
  return null;
}

// Columnas que alteran la aritmética y no se soportan: ante ellas, revisión manual.
const UNSUPPORTED_RE = /recargo|irpf|retenc|\bre\b/;

interface Grid {
  source: "table" | "words";
  cols: Partial<Record<Col, number>>;
  rows: string[][];
  errors: string[];
}

// ---- Vía 1: tabla de layout ----
function tableMatrix(t: DiTable): string[][] {
  const m: string[][] = Array.from({ length: t.rowCount }, () => Array<string>(t.columnCount).fill(""));
  for (const c of t.cells) {
    const row = m[c.rowIndex];
    if (row && c.columnIndex < t.columnCount) row[c.columnIndex] = (c.content ?? "").replace(/\s+/g, " ").trim();
  }
  return m;
}

function gridFromTables(tables: DiTable[]): { grid: Grid | null; errors: string[] } {
  const found: Grid[] = [];
  for (const t of tables) {
    const m = tableMatrix(t);
    for (let r = 0; r < m.length; r++) {
      const header = m[r] ?? [];
      const cols: Partial<Record<Col, number>> = {};
      header.forEach((c, i) => {
        const k = classifyHeader(c);
        if (k && cols[k] === undefined) cols[k] = i;
      });
      if (cols.vat === undefined && cols.base !== undefined && cols.rate !== undefined) {
        const bareVat = header.findIndex((cell, index) => normLabel(cell) === "iva" && index !== cols.base && index !== cols.rate);
        if (bareVat >= 0) cols.vat = bareVat;
      }
      if (cols.base !== undefined && cols.rate !== undefined && cols.vat !== undefined) {
        const errors = header.some((c) => UNSUPPORTED_RE.test(normLabel(c)))
          ? ["La tabla fiscal tiene columnas no soportadas (recargo/IRPF/retención): revisión manual."]
          : [];
        found.push({ source: "table", cols, rows: m.slice(r + 1), errors });
        break;
      }
    }
  }
  if (found.length > 1) return { grid: null, errors: [`Se encontraron ${found.length} tablas fiscales candidatas.`] };
  return { grid: found[0] ?? null, errors: [] };
}

// ---- Vía 2: geometría de palabras ----
interface W { t: string; x0: number; x1: number; y0: number; y1: number; cx: number; cy: number; conf?: number }
interface Line { words: W[]; cy: number; h: number }
interface Seg { col: Col; x0: number; x1: number }

function toW(w: DiWord): W | null {
  const p = w.polygon;
  const t = (w.content ?? "").trim();
  if (!p || p.length < 8 || !t) return null;
  const xs = p.filter((_, i) => i % 2 === 0);
  const ys = p.filter((_, i) => i % 2 === 1);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { t, x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, conf: w.confidence };
}

function clusterLines(ws: W[]): Line[] {
  const lines: Line[] = [];
  for (const w of [...ws].sort((a, b) => a.cy - b.cy)) {
    const h = w.y1 - w.y0;
    const last = lines[lines.length - 1];
    if (last && Math.abs(w.cy - last.cy) <= 0.6 * Math.max(h, last.h)) {
      last.words.push(w);
      last.cy = last.words.reduce((s, x) => s + x.cy, 0) / last.words.length;
      last.h = Math.max(last.h, h);
    } else {
      lines.push({ words: [w], cy: w.cy, h });
    }
  }
  for (const l of lines) l.words.sort((a, b) => a.x0 - b.x0);
  return lines;
}

const PHRASES = (
  [
    [["base", "imponible"], "base"], [["base"], "base"],
    [["%", "iva"], "rate"], [["%iva"], "rate"], [["iva", "%"], "rate"], [["tipo", "iva"], "rate"],
    [["imp", "iva"], "vat"], [["importe", "iva"], "vat"], [["cuota", "iva"], "vat"], [["cuota"], "vat"],
    [["total"], "total"], [["importe"], "gross"], [["portes"], "shipping"],
  ] as Array<[string[], Col]>
).sort((a, b) => b[0].length - a[0].length); // primero las frases más largas

function headerSegments(words: W[]): Seg[] {
  const all = words.map((w) => ({ n: normLabel(w.t), w }));
  const idx = all.map((x, i) => (x.n === "" ? -1 : i)).filter((i) => i >= 0);
  const segs: Seg[] = [];
  for (let i = 0; i < idx.length; ) {
    const hit = PHRASES.find(([ph]) => ph.every((p, k) => all[idx[i + k] ?? -1]?.n === p));
    if (!hit) { i++; continue; }
    const [ph, col] = hit;
    const first = idx[i] as number;
    const last = idx[i + ph.length - 1] as number;
    let x1 = Math.max(...all.slice(first, last + 1).map((a) => a.w.x1));
    // absorbe símbolos sin letras que cuelgan de la etiqueta (p. ej. "€" en "Total €")
    for (let j = last + 1; all[j] && all[j]!.n === ""; j++) x1 = Math.max(x1, all[j]!.w.x1);
    segs.push({ col, x0: Math.min(...all.slice(first, last + 1).map((a) => a.w.x0)), x1 });
    i += ph.length;
  }
  return segs;
}

const isNumericLike = (w: W) =>
  parseAmount(w.t) !== null || parseRateBp(w.t) !== null || /^[%€�]$/.test(w.t);

function gridFromWords(page: DiPage, minConf: number): { grid: Grid | null; errors: string[] } {
  const words = (page.words ?? []).map(toW).filter((w): w is W => w !== null);
  if (!words.length) return { grid: null, errors: [] };
  const lines = clusterLines(words);

  const headers = lines
    .map((l) => ({ l, segs: headerSegments(l.words) }))
    .filter((h) => ["base", "rate", "vat"].every((c) => h.segs.some((s) => s.col === c)));
  if (headers.length === 0) return { grid: null, errors: [] };
  if (headers.length > 1) return { grid: null, errors: [`Página ${page.pageNumber}: ${headers.length} cabeceras fiscales candidatas.`] };

  const { l: hdr, segs: rawSegs } = headers[0]!;
  const segs = [...rawSegs].sort((a, b) => a.x0 - b.x0);
  const cols: Partial<Record<Col, number>> = {};
  segs.forEach((s, i) => { if (cols[s.col] === undefined) cols[s.col] = i; });

  const errors: string[] = [];
  if (hdr.words.some((w) => UNSUPPORTED_RE.test(normLabel(w.t)))) {
    errors.push("La tabla fiscal tiene columnas no soportadas (recargo/IRPF/retención): revisión manual.");
  }

  const rows: string[][] = [];
  let prevCy = hdr.cy;
  for (const line of lines.slice(lines.indexOf(hdr) + 1)) {
    if (line.cy - prevCy > 3 * hdr.h) break;            // hueco grande: fin de la tabla
    if (!line.words.every(isNumericLike)) break;         // aparece texto: fin de la tabla
    prevCy = line.cy;
    const cells: string[][] = segs.map(() => []);
    let lastSlot = -1;
    for (const w of line.words) {
      if (w.conf !== undefined && w.conf < minConf) errors.push(`Confianza baja (${w.conf}) en "${w.t}".`);
      if (/^[%€�]$/.test(w.t) && lastSlot >= 0) { cells[lastSlot]!.push(w.t); continue; }
      let best = -1, bestD = Infinity;
      segs.forEach((s, i) => {
        const d = Math.abs(w.cx - (s.x0 + s.x1) / 2);
        if (d < bestD) { bestD = d; best = i; }
      });
      const s = segs[best];
      if (!s || bestD > Math.max(3 * hdr.h, s.x1 - s.x0)) errors.push(`Valor "${w.t}" sin columna asignable.`);
      else { cells[best]!.push(w.t); lastSlot = best; }
    }
    rows.push(cells.map((c) => c.join(" ")));
    if (rows.length > 8) { errors.push("Demasiadas filas bajo la cabecera fiscal."); break; }
  }
  return { grid: { source: "words", cols, rows, errors }, errors: [] };
}

// ---- Interpretación y validación ----
interface Outcome { summary?: TaxSummary; errors: string[]; warnings: string[] }
interface ParsedRow extends TaxRow { rowTotal: Cents | null }

function evaluate(grid: Grid, o: Opts): Outcome {
  const errors = [...grid.errors];
  const warnings: string[] = [];
  const get = (row: string[], k: Col) => {
    const i = grid.cols[k];
    return i === undefined ? "" : (row[i] ?? "").trim();
  };
  const amount = (s: string, label: string): Cents | null => {
    if (!s) return null;
    const v = parseAmount(s);
    if (v === null) errors.push(`${label}: importe no válido ${JSON.stringify(s)}.`);
    return v;
  };

  const rows: ParsedRow[] = [];
  const looseTotals: Cents[] = [];
  const grossCells: Cents[] = [];
  const shippingCells: Cents[] = [];

  grid.rows.forEach((row, idx) => {
    if (row.every((c) => !c.trim())) return;
    const label = `Fila ${idx + 1}`;
    const bS = get(row, "base"), rS = get(row, "rate"), vS = get(row, "vat");
    const total = amount(get(row, "total"), `${label} Total`);
    const gross = amount(get(row, "gross"), `${label} Importe`);
    const ship = amount(get(row, "shipping"), `${label} Portes`);
    if (gross !== null) grossCells.push(gross);
    if (ship !== null) shippingCells.push(ship);

    const filled = [bS, rS, vS].filter(Boolean).length;
    if (filled === 0) { if (total !== null) looseTotals.push(total); return; }
    if (filled < 3) { errors.push(`${label}: fila fiscal incompleta (base/tipo/cuota).`); return; }

    const base = amount(bS, `${label} Base`);
    const vat = amount(vS, `${label} Cuota`);
    const rateBp = parseRateBp(rS);
    if (rateBp === null) errors.push(`${label}: tipo de IVA no válido ${JSON.stringify(rS)}.`);
    if (base === null || vat === null || rateBp === null) return;
    rows.push({ base, rateBp, vat, rowTotal: total });
  });

  if (rows.length === 0) errors.push("La tabla fiscal no contiene filas con base, tipo y cuota.");
  if (errors.length) return { errors, warnings };

  // Fila a fila
  const seen = new Set<number>();
  for (const r of rows) {
    const t = `${r.rateBp / 100} %`;
    if (!o.allowedRatesBp.includes(r.rateBp)) errors.push(`Tipo de IVA no permitido: ${t}.`);
    if (seen.has(r.rateBp)) errors.push(`Tipo de IVA duplicado: ${t}.`);
    seen.add(r.rateBp);
    const expected = Math.round((r.base * r.rateBp) / 10000);
    if (Math.abs(expected - r.vat) > o.rowToleranceCents) {
      errors.push(`${t}: base ${formatCents(r.base)} × ${t} = ${formatCents(expected)}, pero la cuota leída es ${formatCents(r.vat)}.`);
    }
  }

  const baseTotal = rows.reduce((s, r) => s + r.base, 0);
  const vatTotal = rows.reduce((s, r) => s + r.vat, 0);
  const grossTotal = baseTotal + vatTotal;

  // ¿La columna Total es por fila (base+cuota) o el total de la factura (una sola celda)?
  let tableTotal: Cents | null = null;
  const perRow =
    rows.every((r) => r.rowTotal !== null) &&
    rows.every((r) => Math.abs((r.rowTotal as number) - (r.base + r.vat)) <= o.rowToleranceCents);
  if (perRow) {
    if (rows.length === 1) tableTotal = rows[0]!.rowTotal;
  } else {
    const distinct = [...new Set([...rows.map((r) => r.rowTotal).filter((t): t is Cents => t !== null), ...looseTotals])];
    if (distinct.length === 1) tableTotal = distinct[0]!;
    else if (distinct.length > 1) errors.push(`Columna Total ambigua: ${distinct.map(formatCents).join(" / ")}.`);
  }

  const declared: Array<[string, Cents]> = [];
  if (tableTotal !== null) declared.push(["Total de la tabla", tableTotal]);
  if (o.headerTotal !== null) declared.push(["Total de cabecera", o.headerTotal]);
  if (declared.length === 0) errors.push("No hay un total de factura independiente contra el que validar.");
  for (const [name, v] of declared) {
    if (Math.abs(v - grossTotal) > o.totalToleranceCents) {
      errors.push(`${name} ${formatCents(v)} ≠ Σbases ${formatCents(baseTotal)} + ΣIVA ${formatCents(vatTotal)} = ${formatCents(grossTotal)}.`);
    }
  }

  // Control cruzado con la columna "Importe" (+ Portes), si existe
  const g = grossCells[0];
  if (g !== undefined) {
    const expectedBase = g + (shippingCells[0] ?? 0);
    if (Math.abs(baseTotal - expectedBase) > o.totalToleranceCents) {
      const msg = `Σbases ${formatCents(baseTotal)} ≠ Importe + Portes ${formatCents(expectedBase)}.`;
      (o.strictGrossCheck ? errors : warnings).push(msg);
    }
  }

  if (errors.length) return { errors, warnings };
  return {
    errors,
    warnings,
    summary: { rows: rows.map(({ base, rateBp, vat }) => ({ base, rateBp, vat })), baseTotal, vatTotal, grossTotal, source: grid.source },
  };
}

const canon = (s: TaxSummary) =>
  JSON.stringify([...s.rows].sort((a, b) => a.rateBp - b.rateBp));

/**
 * Punto de entrada. `result` es el AnalyzeResult de prebuilt-layout de la(s) página(s) fiscal(es).
 * Si devuelve ok:false: no registrar ni archivar; enviar a revisión manual con `errors`.
 */
export function extractFiscal(result: DiAnalyzeResult, options: FiscalOptions = {}): FiscalResult {
  const o: Opts = { ...DEFAULTS, ...options };
  const outcomes: Array<{ via: "table" | "words"; out: Outcome }> = [];

  const t = gridFromTables(result.tables ?? []);
  if (t.grid) outcomes.push({ via: "table", out: evaluate(t.grid, o) });
  else if (t.errors.length) outcomes.push({ via: "table", out: { errors: t.errors, warnings: [] } });

  for (const p of [...(result.pages ?? [])].sort((a, b) => b.pageNumber - a.pageNumber)) {
    const w = gridFromWords(p, o.minWordConfidence);
    if (w.grid) { outcomes.push({ via: "words", out: evaluate(w.grid, o) }); break; }
    if (w.errors.length) { outcomes.push({ via: "words", out: { errors: w.errors, warnings: [] } }); break; }
  }

  const good = outcomes.filter((x) => x.out.summary);
  const failedMsgs = outcomes.filter((x) => !x.out.summary).flatMap((x) => x.out.errors.map((e) => `[${x.via}] ${e}`));
  if (good.length === 0) {
    return {
      ok: false,
      errors: failedMsgs.length ? failedMsgs : ["No se encontró ninguna tabla fiscal (Base Imponible / % IVA / Imp. IVA)."],
      warnings: [],
    };
  }

  const first = good[0]!.out.summary!;
  const warnings = [...good.flatMap((x) => x.out.warnings), ...failedMsgs.map((m) => `Vía alternativa no validó: ${m}`)];
  if (good.length === 2 && canon(first) !== canon(good[1]!.out.summary!)) {
    return { ok: false, errors: ["Las vías 'table' y 'words' validan por separado pero discrepan entre sí."], warnings };
  }
  if (good.length === 1) warnings.push(`Solo la vía '${good[0]!.via}' pudo validar el desglose.`);
  return { ok: true, summary: first, warnings };
}
