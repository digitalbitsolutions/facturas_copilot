import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { importBankRequest, reconcileBankRequest } from "../api/services.ts";
import type { BankImportResult, ReconciliationInvoice, ReconciliationProposal } from "./types.ts";

const fixture = (name: string) => new URL(`../../fixtures/bank/${name}`, import.meta.url);

describe("bank reconciliation workflow", () => {
  it("imports a representative batch, proposes one high match and isolates ambiguity", async () => {
    const input = JSON.parse(await readFile(fixture("extracto-demo.json"), "utf8"));
    const invoices = JSON.parse(await readFile(fixture("facturas-pendientes-demo.json"), "utf8")) as ReconciliationInvoice[];
    const imported = importBankRequest(input) as BankImportResult;
    assert.equal(imported.accepted, true);
    if (!imported.accepted) return;

    const proposals = reconcileBankRequest({ movements: imported.batch.movements, invoices }) as ReconciliationProposal[];
    assert.equal(proposals.length, 2);
    assert.equal(proposals[0].classification, "high");
    assert.equal(proposals[0].candidates[0].invoiceId, "INV-DEMO-001");
    assert.equal(proposals[0].requiresHumanReview, true, "automatic acceptance must remain disabled");
    assert.equal(proposals[1].classification, "review");
    assert.match(proposals[1].reason, /Multiple candidates/);
  });
});
