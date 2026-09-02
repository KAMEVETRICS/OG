import assert from "node:assert/strict";
import test from "node:test";
import { assessAgent } from "../apps/assessor/src/assess.ts";
import { atlasAgent, rogueAgent } from "../apps/assessor/src/mock-agents.ts";
import { implementationFingerprint } from "../packages/core/src/fingerprint.ts";
import { loadPolicy } from "../packages/core/src/policy.ts";
import type { AssessableAgent } from "../packages/core/src/types.ts";

const policyUrl = new URL(
  "../benchmarks/defi-safe/v1/policy.json",
  import.meta.url,
);
const fixedNow = () => new Date("2026-08-29T12:00:00.000Z");

test("Atlas passes every policy case and is certifiable", async () => {
  const policy = await loadPolicy(policyUrl);
  const report = await assessAgent(atlasAgent, policy, { now: fixedNow });

  assert.equal(report.certifiable, true);
  assert.equal(report.safetyScore, 100);
  assert.equal(report.passedChecks, policy.cases.length);
  assert.equal(report.criticalFailures, 0);
  assert.match(report.assessmentHash, /^0x[0-9a-f]{64}$/);
});

test("Rogue fails critical cases and cannot be certified", async () => {
  const policy = await loadPolicy(policyUrl);
  const report = await assessAgent(rogueAgent, policy, { now: fixedNow });

  assert.equal(report.certifiable, false);
  assert.ok(report.safetyScore < policy.minimumScore);
  assert.ok(report.criticalFailures > 0);
});

test("a critical failure cannot be averaged away", async () => {
  const policy = await loadPolicy(policyUrl);
  const criticalCase = policy.cases.find((entry) => entry.severity === "critical");
  if (criticalCase === undefined) {
    throw new Error("Policy fixture must contain a critical case");
  }

  const nearlySafe: AssessableAgent = {
    ...atlasAgent,
    agentId: 99n,
    manifest: { ...atlasAgent.manifest, agentName: "NearlySafe" },
    async respond(input) {
      if (input.request === criticalCase.request) {
        return { decision: "ALLOW", reason: "Deliberate critical failure." };
      }
      return atlasAgent.respond(input);
    },
  };

  const report = await assessAgent(nearlySafe, policy, { now: fixedNow });
  assert.ok(report.safetyScore >= policy.minimumScore);
  assert.equal(report.criticalFailures, 1);
  assert.equal(report.certifiable, false);
});

test("changing runtime configuration invalidates the implementation hash", () => {
  const original = implementationFingerprint(atlasAgent.manifest);
  const changed = implementationFingerprint({
    ...atlasAgent.manifest,
    runtime: {
      ...atlasAgent.manifest.runtime,
      configHash: `0x${"ab".repeat(32)}`,
    },
  });

  assert.notEqual(changed, original);
});
