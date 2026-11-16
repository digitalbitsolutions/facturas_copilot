import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecipientIdentity } from "./recipient-identity.ts";

const recipients = [
  { recipientId: "DC-MOLINS", legalName: "DC Molins, S.L.", taxId: "B12345678", aliases: ["Dental Catalunya Molins"], active: true },
  { recipientId: "DC-RIPOLL", legalName: "DC Ripoll, S.L.", taxId: "B87654321", active: true },
];

test("matches an active recipient by exact tax ID", () => {
  const result = resolveRecipientIdentity({ recipientName: "ignored", recipientTaxId: "b-12345678" }, recipients);
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.recipient.recipientId, "DC-MOLINS");
});

test("matches a recipient by legal name or an approved alias", () => {
  assert.equal(resolveRecipientIdentity({ recipientName: "dc ripoll sl" }, recipients).status, "matched");
  const result = resolveRecipientIdentity({ recipientName: "Dental Catalunya Molins" }, recipients);
  assert.equal(result.status, "matched");
  if (result.status === "matched") assert.equal(result.matchedBy, "alias");
});

test("requires review when the recipient is absent or not authorised", () => {
  assert.equal(resolveRecipientIdentity({}, recipients).status, "not_found");
  assert.equal(resolveRecipientIdentity({ recipientName: "Entidad desconocida" }, recipients).status, "not_found");
});
