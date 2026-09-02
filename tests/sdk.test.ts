import assert from "node:assert/strict";
import test from "node:test";
import type {} from "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";
import { ZeroAddress, keccak256, toUtf8Bytes } from "ethers";
import { AgentSealClient, parseRegistrationMetadata } from "../packages/sdk/src/index.ts";

const { ethers } = await network.create();
const versionHash = keccak256(toUtf8Bytes("sdk-atlas:1.0.0"));
const changedVersionHash = keccak256(toUtf8Bytes("sdk-atlas:1.0.1"));
const policyHash = keccak256(toUtf8Bytes("sdk-defi-safe:1.0.0"));
const evidenceRoot = keccak256(toUtf8Bytes("sdk-evidence"));

test("SDK reads a valid seal and exact-version gate decision", async () => {
  const [owner] = await ethers.getSigners();
  const registry = await ethers.deployContract("AgentSealRegistry", [owner.address]);
  await registry.waitForDeployment();
  const block = await ethers.provider.getBlock("latest");
  assert.notEqual(block, null);

  await (
    await registry.issueSeal({
      agentId: 42n,
      versionHash,
      policyHash,
      evidenceRoot,
      safetyScore: 96,
      passedChecks: 15,
      totalChecks: 15,
      criticalFailures: 0,
      issuedAt: 0,
      expiresAt: BigInt(block!.timestamp + 3_600),
      issuer: ZeroAddress,
      revoked: false,
    })
  ).wait();

  const gate = await ethers.deployContract("AgentGate", [
    await registry.getAddress(),
    policyHash,
    85,
    owner.address,
  ]);
  await gate.waitForDeployment();

  const client = new AgentSealClient({
    provider: ethers.provider,
    identityRegistry: ZeroAddress,
    agentSealRegistry: await registry.getAddress(),
    agentGate: await gate.getAddress(),
    policyHash,
    minimumScore: 85,
    trustedIssuer: owner.address,
  });

  const validation = await client.validate({ agentId: 42n, implementationHash: versionHash });
  assert.equal(validation.status, "valid");
  assert.equal(validation.sealId, 1n);
  assert.equal(validation.seal?.safetyScore, 96);
  assert.equal(validation.seal?.evidenceRoot, evidenceRoot);
  assert.equal(await client.canExecute(42n, versionHash), true);
  assert.equal(await client.canExecute(42n, changedVersionHash), false);

  const current = await client.currentValidSeal(42n, [changedVersionHash, versionHash]);
  assert.equal(current?.sealId, 1n);
  assert.equal(current?.implementationHash, versionHash);
  assert.equal(current?.gateAdmitted, true);
  assert.equal(await client.currentValidSeal(42n, [changedVersionHash]), null);
});

test("SDK parses an ERC-8004 data URI registration card", () => {
  const card = {
    name: "Atlas-0G",
    active: true,
    supportedTrust: ["tee-attestation"],
  };
  const tokenUri = `data:application/json;base64,${btoa(JSON.stringify(card))}`;
  assert.deepEqual(parseRegistrationMetadata(tokenUri), card);
  assert.equal(parseRegistrationMetadata("https://example.invalid/agent.json"), null);
  assert.equal(parseRegistrationMetadata("data:application/json;base64,%%%"), null);
});

test("SDK decodes UTF-8 ERC-8004 registration metadata", () => {
  const card = { name: "机器人", description: "自主代理" };
  const tokenUri = `data:application/json;base64,${Buffer.from(
    JSON.stringify(card),
    "utf8",
  ).toString("base64")}`;

  assert.deepEqual(parseRegistrationMetadata(tokenUri), card);
});
