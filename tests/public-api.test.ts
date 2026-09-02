import assert from "node:assert/strict";
import test from "node:test";

import {
  InputError,
  parseAgentId,
  parseImplementationHash,
  parseOwnerAddress,
  rejectDangerousKeys,
  sanitizeMetadata,
  singleQuery,
} from "../apps/passport/lib/api/input.ts";
import { parseVerifyQuery, serializePassport } from "../apps/passport/lib/api/public.ts";
import { ATLAS_0G } from "../packages/sdk/src/index.ts";
import type { AgentPassport } from "../packages/sdk/src/types.ts";

test("agent IDs reject injection-shaped and oversized values", () => {
  assert.equal(parseAgentId("3522746"), 3_522_746n);
  assert.throws(() => parseAgentId("0"), InputError);
  assert.throws(() => parseAgentId("01"), InputError);
  assert.throws(() => parseAgentId("-1"), InputError);
  assert.throws(() => parseAgentId("3522746;drop"), InputError);
  assert.throws(() => parseAgentId("0x1"), InputError);
  assert.throws(() => parseAgentId(`${"9".repeat(79)}`), InputError);
  assert.throws(() => parseAgentId({ id: "1" }), InputError);
});

test("implementation hashes must be 32-byte hex and are lowercased", () => {
  const mixed = ATLAS_0G.implementationHash.replace("1d", "1D");
  assert.equal(parseImplementationHash(mixed), ATLAS_0G.implementationHash);
  assert.throws(() => parseImplementationHash("0x1234"), InputError);
  assert.throws(() => parseImplementationHash("1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08"), InputError);
  assert.throws(() => parseImplementationHash(["0x00"]), InputError);
});

test("query parameters reject duplicates and control characters", () => {
  const params = new URLSearchParams();
  params.append("implementationHash", ATLAS_0G.implementationHash);
  params.append("implementationHash", ATLAS_0G.implementationHash);
  assert.throws(() => singleQuery(params, "implementationHash"), InputError);
  const injected = new URLSearchParams();
  injected.set("implementationHash", "0x00\nHost: evil");
  assert.throws(() => singleQuery(injected, "implementationHash"), InputError);
});

test("JSON objects cannot carry prototype-pollution keys", () => {
  assert.throws(
    () => rejectDangerousKeys(JSON.parse('{"__proto__":{"admin":true}}')),
    InputError,
  );
  assert.throws(
    () => rejectDangerousKeys({ nested: { constructor: { prototype: {} } } }),
    InputError,
  );
  rejectDangerousKeys({ agentId: "1", systemPrompt: "ok" });
});

test("owner addresses must be 20-byte hex", () => {
  const owner = parseOwnerAddress("0xaD55ddee566c2ACEa8d3f491248BdAC5e58Ed9c0");
  assert.equal(owner, "0xad55ddee566c2acea8d3f491248bdac5e58ed9c0");
  assert.throws(() => parseOwnerAddress("ad55ddee566c2acea8d3f491248bdac5e58ed9c0"), InputError);
  assert.throws(() => parseOwnerAddress("0xgg"), InputError);
});

test("metadata sanitizer drops javascript URLs and clips strings", () => {
  const clean = sanitizeMetadata({
    name: "A".repeat(200),
    description: "<script>alert(1)</script>",
    services: [
      { name: "AgentSeal Assessment", endpoint: "https://example.com/package.json" },
      { name: "evil", endpoint: "javascript:alert(1)" },
      { name: "local", endpoint: "http://127.0.0.1/x" },
    ],
  });
  assert.equal(typeof clean?.name === "string" ? clean.name.length : 0, 120);
  assert.equal(
    (clean?.services as Array<{ endpoint?: string }>)[0]?.endpoint,
    "https://example.com/package.json",
  );
  assert.equal((clean?.services as Array<{ endpoint?: string }>)[1]?.endpoint, undefined);
  assert.equal((clean?.services as Array<{ endpoint?: string }>)[2]?.endpoint, undefined);
});

test("verify query parser accepts versionHash alias and rejects bad path IDs", () => {
  const parsed = parseVerifyQuery(
    "3522746",
    new URLSearchParams({ versionHash: ATLAS_0G.implementationHash }),
  );
  assert.equal(parsed.agentId, ATLAS_0G.agentId);
  assert.equal(parsed.implementationHash, ATLAS_0G.implementationHash);
  assert.throws(() => parseVerifyQuery("../etc/passwd", new URLSearchParams()), InputError);
  assert.throws(
    () => parseVerifyQuery("3522746", new URLSearchParams()),
    InputError,
  );
});

test("passport serializer uses strings not bigints", () => {
  const now = new Date("2026-09-02T00:00:00.000Z");
  const passport: AgentPassport = {
    agentId: ATLAS_0G.agentId,
    implementationHash: ATLAS_0G.implementationHash,
    identity: {
      agentId: ATLAS_0G.agentId,
      owner: "0xaD55ddee566c2ACEa8d3f491248BdAC5e58Ed9c0",
      tokenUri: `data:application/json,${"x".repeat(3_000)}`,
      metadata: { name: "Atlas-0G", active: true },
    },
    validation: {
      status: "valid",
      sealId: 1n,
      seal: {
        sealId: 1n,
        agentId: ATLAS_0G.agentId,
        versionHash: ATLAS_0G.implementationHash,
        policyHash: "0x5635eef2ec2ab753999901846dc52029f59a751d04d818f19acf1dd33c077ddb",
        evidenceRoot: ATLAS_0G.evidenceRoot,
        safetyScore: 100,
        passedChecks: 15,
        totalChecks: 15,
        criticalFailures: 0,
        issuedAt: now,
        expiresAt: now,
        issuer: "0xaD55ddee566c2ACEa8d3f491248BdAC5e58Ed9c0",
        revoked: false,
      },
    },
    gateAdmitted: true,
    safeToIntegrate: true,
    checkedAt: now,
  };
  const json = serializePassport(passport);
  assert.equal(json.agentId, "3522746");
  assert.equal(json.validation.sealId, "1");
  assert.equal(typeof json.identity?.tokenUri, "string");
  assert.ok((json.identity?.tokenUri?.length ?? 0) <= 2_049);
  assert.doesNotThrow(() => JSON.stringify(json));
});
