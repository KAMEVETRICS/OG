import assert from "node:assert/strict";
import test from "node:test";
import {
  loadPassport,
  parsePassportQuery,
} from "../apps/passport/lib/passport-data.ts";
import { ATLAS_0G, ROGUE_DEMO } from "../packages/sdk/src/index.ts";

test("Passport remains empty when lookup parameters are absent", async () => {
  const query = parsePassportQuery({});
  const result = await loadPassport(query);

  assert.equal(query.submitted, false);
  assert.equal(query.validationError, null);
  assert.equal(query.agentId, null);
  assert.equal(query.implementationHash, null);
  assert.equal(query.agentIdInput, "");
  assert.equal(query.implementationHashInput, "");
  assert.equal(result.passport, null);
  assert.equal(result.error, null);
  assert.equal(result.errorKind, null);
});

test("Passport accepts the current Atlas and Rogue inspect fixtures", () => {
  const atlas = parsePassportQuery({
    agentId: ATLAS_0G.agentId.toString(),
    versionHash: ATLAS_0G.implementationHash,
  });
  const rogue = parsePassportQuery({
    agentId: ROGUE_DEMO.agentId.toString(),
    versionHash: ROGUE_DEMO.implementationHash,
  });

  assert.equal(atlas.validationError, null);
  assert.equal(atlas.agentId, ATLAS_0G.agentId);
  assert.equal(atlas.implementationHash, ATLAS_0G.implementationHash);
  assert.equal(rogue.validationError, null);
  assert.equal(rogue.agentId, ROGUE_DEMO.agentId);
  assert.equal(rogue.implementationHash, ROGUE_DEMO.implementationHash);
});

test("Passport does not convert legacy demo selectors into lookup values", () => {
  const query = parsePassportQuery({ demo: "rogue" });

  assert.equal(query.submitted, false);
  assert.equal(query.validationError, null);
  assert.equal(query.agentId, null);
  assert.equal(query.implementationHash, null);
  assert.equal(query.agentIdInput, "");
  assert.equal(query.implementationHashInput, "");
});

test("Passport rejects malformed lookup parameters instead of substituting Atlas", async () => {
  const query = parsePassportQuery({
    agentId: "not-an-id",
    versionHash: "bad",
  });
  const result = await loadPassport(query);

  assert.equal(query.submitted, true);
  assert.equal(query.agentId, null);
  assert.equal(query.implementationHash, null);
  assert.match(query.validationError ?? "", /positive ERC-8004 agent ID/);
  assert.match(query.validationError ?? "", /32-byte implementation hash/);
  assert.equal(result.passport, null);
  assert.equal(result.error, query.validationError);
  assert.equal(result.errorKind, "validation");
});
