import assert from "node:assert/strict";
import test from "node:test";

import {
  CHALLENGE_TTL_MS,
  createChallengeMessage,
  parseChallengeExpiry,
  parseChallengeNonce,
  parseRequestId,
  tokenHash,
  tokenHashesEqual,
} from "../apps/passport/lib/certification/challenge.ts";

test("challenge messages bind origin, implementation, and nonce", () => {
  const input = {
    requestId: "11111111-1111-4111-8111-111111111111",
    agentId: "3522746",
    implementationHash:
      "0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08",
    packageUrl:
      "https://og-agentseal.vercel.app/api/agents/3522746/assessment-packages/0x1d8295513c2bd53441fc08189a071a9031d6ab76d5f8f77c5f595c69ad0bda08",
    ownerAddress: "0xad55ddee566c2acea8d3f491248bdac5e58ed9c0",
    origin: "https://og-agentseal.vercel.app",
    expiresAt: Date.parse("2026-09-02T12:00:00.000Z"),
    nonce: "aa".repeat(16),
  };
  const message = createChallengeMessage(input);
  assert.match(message, /Origin: https:\/\/og-agentseal\.vercel\.app/);
  assert.match(message, /Implementation: 0x1d829551/);
  assert.match(message, /Nonce: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/);
  assert.equal(
    createChallengeMessage({ ...input, origin: "https://evil.example" }).includes(
      "Origin: https://og-agentseal.vercel.app",
    ),
    false,
  );
});

test("challenge fields reject replay-shaped identifiers and stale expiry", () => {
  assert.equal(
    parseRequestId("11111111-1111-4111-8111-111111111111"),
    "11111111-1111-4111-8111-111111111111",
  );
  assert.throws(() => parseRequestId("not-a-uuid"));
  assert.equal(parseChallengeNonce("ab".repeat(16)), "ab".repeat(16));
  assert.throws(() => parseChallengeNonce("short"));
  const now = Date.parse("2026-09-02T12:00:00.000Z");
  assert.equal(
    parseChallengeExpiry(new Date(now + 60_000).toISOString(), now),
    now + 60_000,
  );
  assert.throws(() => parseChallengeExpiry(new Date(now - 1).toISOString(), now));
  assert.throws(() =>
    parseChallengeExpiry(new Date(now + CHALLENGE_TTL_MS + 1).toISOString(), now),
  );
});

test("resume token hashes compare in constant time", async () => {
  const hash = await tokenHash("a".repeat(64));
  assert.equal(tokenHashesEqual(hash, hash), true);
  assert.equal(tokenHashesEqual(hash, await tokenHash("b".repeat(64))), false);
  assert.equal(tokenHashesEqual(hash, hash.slice(1)), false);
});
