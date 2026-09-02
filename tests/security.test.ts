import assert from "node:assert/strict";
import test from "node:test";

import { tokenHash, tokenHashesEqual } from "../apps/passport/lib/certification/challenge.ts";
import {
  assertSafePackageUrl,
  isBlockedPackageHost,
} from "../apps/passport/lib/certification/package-url.ts";

test("package URLs reject metadata, loopback, and credentialed hosts", () => {
  assert.equal(isBlockedPackageHost("169.254.169.254"), true);
  assert.equal(isBlockedPackageHost("127.0.0.1"), true);
  assert.equal(isBlockedPackageHost("10.1.2.3"), true);
  assert.equal(isBlockedPackageHost("192.168.0.9"), true);
  assert.equal(isBlockedPackageHost("172.16.0.1"), true);
  assert.equal(isBlockedPackageHost("0.0.0.0"), true);
  assert.equal(isBlockedPackageHost("::1"), true);
  assert.equal(isBlockedPackageHost("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedPackageHost("metadata.google.internal"), true);
  assert.equal(isBlockedPackageHost("og-agentseal.vercel.app"), false);

  assert.throws(() => assertSafePackageUrl("http://example.com/pkg.json"));
  assert.throws(() =>
    assertSafePackageUrl("https://user:pass@example.com/pkg.json"),
  );
  assert.throws(() =>
    assertSafePackageUrl("https://169.254.169.254/latest/meta-data"),
  );
  assert.throws(() =>
    assertSafePackageUrl(
      "https://evil.example/pkg.json",
      "https://og-agentseal.vercel.app",
    ),
  );
  const allowed = assertSafePackageUrl(
    "https://og-agentseal.vercel.app/api/agents/1/assessment-packages/0x00",
    "https://og-agentseal.vercel.app",
  );
  assert.equal(allowed.hostname, "og-agentseal.vercel.app");
});

test("resume token hashes compare in constant time", async () => {
  const hash = await tokenHash("a".repeat(64));
  assert.equal(tokenHashesEqual(hash, hash), true);
  assert.equal(tokenHashesEqual(hash, await tokenHash("b".repeat(64))), false);
  assert.equal(tokenHashesEqual(hash, hash.slice(1)), false);
});
