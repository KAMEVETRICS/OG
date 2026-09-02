import assert from "node:assert/strict";
import test from "node:test";
import { createOgComputeImplementationManifest } from "../apps/assessor/src/og-compute-agent.ts";
import { assessAgent } from "../apps/assessor/src/assess.ts";
import { atlasAgent } from "../apps/assessor/src/mock-agents.ts";
import { implementationFingerprint } from "../packages/core/src/fingerprint.ts";
import { loadPolicy } from "../packages/core/src/policy.ts";
import { OgComputeRouterClient } from "../packages/og-compute/src/router-client.ts";
import {
  prepareCanonicalData,
  prepareEvidence,
} from "../packages/og-storage/src/evidence-store.ts";

const policyUrl = new URL("../benchmarks/defi-safe/v1/policy.json", import.meta.url);

function verifiedResponse(teeVerified: boolean): Response {
  return new Response(
    JSON.stringify({
      id: "chat-body-id",
      model: "test/model",
      choices: [{ message: { content: '{"decision":"BLOCK","reason":"unsafe"}' } }],
      x_0g_trace: {
        request_id: "request-1",
        provider: "0x000000000000000000000000000000000000bEEF",
        tee_verified: teeVerified,
        billing: { input_cost: "1", output_cost: "2", total_cost: "3" },
      },
    }),
    { status: 200, headers: { "ZG-Res-Key": "chat-header-id" } },
  );
}

test("Compute Router client requests and preserves verified TEE provenance", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const client = new OgComputeRouterClient({
    apiKey: "sk-test",
    model: "test/model",
    fetch: async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return verifiedResponse(true);
    },
  });

  const result = await client.completeJson<{ decision: string }>([
    { role: "user", content: "test" },
  ]);

  assert.equal(requestBody?.verify_tee, true);
  assert.equal(result.receipt.teeVerified, true);
  assert.equal(result.receipt.chatId, "chat-header-id");
  assert.equal(result.receipt.provider, "0x000000000000000000000000000000000000bEEF");
  assert.equal(result.output.decision, "BLOCK");
});

test("Compute Router client parses JSON wrapped in markdown fences", async () => {
  const client = new OgComputeRouterClient({
    apiKey: "sk-test",
    model: "test/model",
    fetch: async () =>
      new Response(
        JSON.stringify({
          id: "chat-body-id",
          model: "test/model",
          choices: [
            {
              message: {
                content: '```json\n{"decision":"REFUSE","reason":"unsafe"}\n```',
              },
            },
          ],
          x_0g_trace: {
            request_id: "request-1",
            provider: "0x000000000000000000000000000000000000bEEF",
            tee_verified: true,
          },
        }),
        { status: 200, headers: { "ZG-Res-Key": "chat-header-id" } },
      ),
  });

  const result = await client.completeJson<{ decision: string }>([
    { role: "user", content: "test" },
  ]);
  assert.equal(result.output.decision, "REFUSE");
});

test("Compute Router client fails closed when TEE verification fails", async () => {
  const client = new OgComputeRouterClient({
    apiKey: "sk-test",
    model: "test/model",
    fetch: async () => verifiedResponse(false),
  });

  await assert.rejects(
    client.completeJson([{ role: "user", content: "test" }]),
    /failed required TEE verification/,
  );
});

test("implementation fingerprint changes with executable source content", () => {
  const client = new OgComputeRouterClient({
    apiKey: "sk-test",
    model: "test/model",
    fetch: async () => verifiedResponse(true),
  });
  const first = createOgComputeImplementationManifest(client, [
    { name: "agent.ts", content: "export const decision = 'ALLOW';" },
  ]);
  const second = createOgComputeImplementationManifest(client, [
    { name: "agent.ts", content: "export const decision = 'BLOCK';" },
  ]);

  assert.notEqual(first.source.commit, second.source.commit);
  assert.notEqual(implementationFingerprint(first), implementationFingerprint(second));
});

test("assessment evidence produces a deterministic 0G Storage root", async () => {
  const policy = await loadPolicy(policyUrl);
  const report = await assessAgent(atlasAgent, policy, {
    now: () => new Date("2026-08-29T12:00:00.000Z"),
  });

  const first = await prepareEvidence(report);
  const second = await prepareEvidence(report);
  assert.match(first.rootHash, /^0x[0-9a-fA-F]{64}$/);
  assert.equal(first.rootHash, second.rootHash);
  assert.equal(first.contentDigest, second.contentDigest);
});

test("arbitrary canonical package data produces a deterministic 0G Storage root", async () => {
  const value = { schemaVersion: "1.0", manifest: { agentName: "Test Agent" }, tools: ["read"] };
  const first = await prepareCanonicalData(value);
  const second = await prepareCanonicalData(value);
  assert.equal(first.rootHash, second.rootHash);
  assert.equal(first.contentDigest, second.contentDigest);
});
