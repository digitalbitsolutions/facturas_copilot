/**
 * Diagnóstico acotado: vuelca SOLO la tabla fiscal (todas sus celdas, también las vacías o ausentes)
 * y las palabras que caen dentro de su rectángulo. No incluye el resto de la factura.
 * Entrada: AnalyzeResult de prebuilt-layout de la página fiscal.
 */
import { classifyHeader, type Col, type DiAnalyzeResult, type DiTable } from "./fiscal.ts";

export interface TaxTableDump {
  page: number | null;
  rowCount: number;
  columnCount: number;
  matrix: string[][]; // todas las posiciones; "" si vacía o ausente
  cells: Array<{ row: number; col: number; kind?: string; rowSpan?: number; columnSpan?: number; content: string; polygon?: number[] }>;
  absentPositions: Array<[number, number]>; // (fila, columna) que NO existen como celda en el JSON
  headerRow: number | null;
  columnsDetected: Partial<Record<Col, number>>;
  missingHeaders: Array<"base" | "rate" | "vat">;
  bbox: [number, number, number, number] | null; // xmin, ymin, xmax, ymax
  wordsInside: Array<{ content: string; confidence?: number; polygon: number[] }>;
}

function bboxOf(t: DiTable): [number, number, number, number] | null {
  const polys: number[][] = [];
  const tp = t.boundingRegions?.[0]?.polygon;
  if (tp && tp.length >= 8) polys.push(tp);
  else for (const c of t.cells) { const p = c.boundingRegions?.[0]?.polygon; if (p && p.length >= 8) polys.push(p); }
  if (!polys.length) return null;
  const xs = polys.flatMap((p) => p.filter((_, i) => i % 2 === 0));
  const ys = polys.flatMap((p) => p.filter((_, i) => i % 2 === 1));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

export function dumpTaxTables(result: DiAnalyzeResult): TaxTableDump[] {
  const dumps: TaxTableDump[] = [];
  for (const t of result.tables ?? []) {
    // candidata: alguna celda se reconoce como cabecera de base, tipo o cuota
    const hdrCells = t.cells.filter((c) => ["base", "rate", "vat"].includes(classifyHeader(c.content ?? "") ?? ""));
    if (!hdrCells.length) continue;

    const matrix = Array.from({ length: t.rowCount }, () => Array<string>(t.columnCount).fill(""));
    const covered = new Set<string>();
    for (const c of t.cells) {
      const row = matrix[c.rowIndex];
      if (row) row[c.columnIndex] = (c.content ?? "").replace(/\s+/g, " ").trim();
      for (let r = 0; r < (c.rowSpan ?? 1); r++)
        for (let k = 0; k < (c.columnSpan ?? 1); k++) covered.add(`${c.rowIndex + r},${c.columnIndex + k}`);
    }
    const absent: Array<[number, number]> = [];
    for (let r = 0; r < t.rowCount; r++) for (let k = 0; k < t.columnCount; k++) if (!covered.has(`${r},${k}`)) absent.push([r, k]);

    const headerRow = hdrCells[0]!.rowIndex;
    const columnsDetected: Partial<Record<Col, number>> = {};
    for (const c of t.cells.filter((x) => x.rowIndex === headerRow)) {
      const k = classifyHeader(c.content ?? "");
      if (k && columnsDetected[k] === undefined) columnsDetected[k] = c.columnIndex;
    }
    const missingHeaders = (["base", "rate", "vat"] as const).filter((k) => columnsDetected[k] === undefined);

    const page = t.boundingRegions?.[0]?.pageNumber ?? t.cells[0]?.boundingRegions?.[0]?.pageNumber ?? null;
    const bbox = bboxOf(t);
    const wordsInside: TaxTableDump["wordsInside"] = [];
    if (bbox && page !== null) {
      const pad = 0.05 * Math.max(bbox[2] - bbox[0], bbox[3] - bbox[1]) / 10;
      const pg = (result.pages ?? []).find((p) => p.pageNumber === page);
      for (const w of pg?.words ?? []) {
        const p = w.polygon;
        if (!p || p.length < 8) continue;
        const cx = (Math.min(...p.filter((_, i) => i % 2 === 0)) + Math.max(...p.filter((_, i) => i % 2 === 0))) / 2;
        const cy = (Math.min(...p.filter((_, i) => i % 2 === 1)) + Math.max(...p.filter((_, i) => i % 2 === 1))) / 2;
        if (cx >= bbox[0] - pad && cx <= bbox[2] + pad && cy >= bbox[1] - pad && cy <= bbox[3] + pad) {
          wordsInside.push({ content: w.content, confidence: w.confidence, polygon: p });
        }
      }
    }

    dumps.push({
      page, rowCount: t.rowCount, columnCount: t.columnCount, matrix,
      cells: t.cells.map((c) => ({
        row: c.rowIndex, col: c.columnIndex, kind: c.kind, rowSpan: c.rowSpan, columnSpan: c.columnSpan,
        content: c.content ?? "", polygon: c.boundingRegions?.[0]?.polygon,
      })),
      absentPositions: absent, headerRow, columnsDetected, missingHeaders, bbox, wordsInside,
    });
  }
  return dumps;
}
