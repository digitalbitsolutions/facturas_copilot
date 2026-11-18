import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecipientIdentity } from "./recipient-identity.ts";

const recipients = [{ recipientId: "DC-MOLINS", legalName: "DC Molins, S.L.", taxId: "B12345678", aliases: ["Dental Catalunya Molins"], active: true }];

test("matches an active recipient by tax ID and approved alias", () => {
  assert.equal(resolveRecipientIdentity({ recipientTaxId: "b-12345678" }, recipients).status, "matched");
  const result = resolveRecipientIdentity({ recipientName: "Dental Catalunya Molins" }, recipients);
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.matchedBy, "alias");
});

test("requires review for an unauthorised recipient", () => {
  assert.equal(resolveRecipientIdentity({ recipientName: "Desconocida" }, recipients).status, "not_found");
});
