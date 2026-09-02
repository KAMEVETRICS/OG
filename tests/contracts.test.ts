import assert from "node:assert/strict";
import test from "node:test";
import type {} from "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";
import { ZeroAddress, keccak256, toUtf8Bytes } from "ethers";

const { ethers } = await network.create();

const versionHash = keccak256(toUtf8Bytes("atlas:1.0.0"));
const changedVersionHash = keccak256(toUtf8Bytes("atlas:1.0.1"));
const policyHash = keccak256(toUtf8Bytes("defi-safe:1.0.0"));
const evidenceRoot = keccak256(toUtf8Bytes("assessment:evidence"));

async function deployFixture() {
  const [owner, outsider, secondIssuer] = await ethers.getSigners();
  const registry = await ethers.deployContract("AgentSealRegistry", [owner.address]);
  await registry.waitForDeployment();
  const latestBlock = await ethers.provider.getBlock("latest");
  if (latestBlock === null) throw new Error("Missing latest block");

  const expiresAt = BigInt(latestBlock.timestamp + 3_600);
  const validCandidate = {
    agentId: 18_422n,
    versionHash,
    policyHash,
    evidenceRoot,
    safetyScore: 94,
    passedChecks: 15,
    totalChecks: 15,
    criticalFailures: 0,
    issuedAt: 0,
    expiresAt,
    issuer: ZeroAddress,
    revoked: false,
  };

  return { owner, outsider, secondIssuer, registry, validCandidate, expiresAt };
}

async function issueValidSeal() {
  const fixture = await deployFixture();
  await (await fixture.registry.issueSeal(fixture.validCandidate)).wait();
  const [, sealId] = await fixture.registry.validateSeal(
    fixture.validCandidate.agentId,
    versionHash,
    policyHash,
    85,
    fixture.owner.address,
  );
  return { ...fixture, sealId };
}

test("issues a valid version-bound seal and admits it through AgentGate", async () => {
  const { owner, registry } = await issueValidSeal();
  const [status, sealId] = await registry.validateSeal(
    18_422n,
    versionHash,
    policyHash,
    85,
    owner.address,
  );

  assert.equal(status, 0n);
  assert.equal(sealId, 1n);

  const gate = await ethers.deployContract("AgentGate", [
    await registry.getAddress(),
    policyHash,
    85,
    owner.address,
  ]);
  await gate.waitForDeployment();

  assert.equal(await gate.canExecute(18_422n, versionHash), true);
  assert.equal(await gate.canExecute(18_422n, changedVersionHash), false);
});

test("refuses to issue a seal with a critical failure", async () => {
  const { registry, validCandidate } = await deployFixture();

  await assert.rejects(
    registry.issueSeal({
      ...validCandidate,
      passedChecks: 14,
      criticalFailures: 1,
    }),
  );
});

test("only an authorized issuer can create a seal", async () => {
  const { outsider, registry, validCandidate } = await deployFixture();

  const outsiderRegistry = registry.connect(outsider) as typeof registry;
  await assert.rejects(outsiderRegistry.issueSeal(validCandidate));
});

test("an authorized issuer cannot replace another trusted issuer's latest seal", async () => {
  const { owner, secondIssuer, registry, validCandidate } = await deployFixture();
  await (await registry.issueSeal(validCandidate)).wait();
  await (await registry.setIssuer(secondIssuer.address, true)).wait();

  const secondIssuerRegistry = registry.connect(secondIssuer) as typeof registry;
  await (
    await secondIssuerRegistry.issueSeal({
      ...validCandidate,
      evidenceRoot: keccak256(toUtf8Bytes("assessment:second-issuer")),
    })
  ).wait();

  const [ownerStatus, ownerSealId] = await registry.validateSeal(
    validCandidate.agentId,
    versionHash,
    policyHash,
    85,
    owner.address,
  );
  const [secondStatus, secondSealId] = await registry.validateSeal(
    validCandidate.agentId,
    versionHash,
    policyHash,
    85,
    secondIssuer.address,
  );
  const [wildcardStatus, wildcardSealId] = await registry.validateSeal(
    validCandidate.agentId,
    versionHash,
    policyHash,
    85,
    ZeroAddress,
  );

  assert.deepEqual([ownerStatus, ownerSealId], [0n, 1n]);
  assert.deepEqual([secondStatus, secondSealId], [0n, 2n]);
  assert.deepEqual([wildcardStatus, wildcardSealId], [0n, 2n]);
});

test("revocation immediately invalidates a seal", async () => {
  const { registry, sealId } = await issueValidSeal();
  await (await registry.revokeSeal(sealId)).wait();

  const [status] = await registry.validateSeal(
    18_422n,
    versionHash,
    policyHash,
    85,
    ZeroAddress,
  );
  assert.equal(status, 2n);
});

test("expiry invalidates an otherwise valid seal", async () => {
  const { registry, expiresAt } = await issueValidSeal();
  await ethers.provider.send("evm_setNextBlockTimestamp", [Number(expiresAt)]);
  await ethers.provider.send("evm_mine", []);

  const [status] = await registry.validateSeal(
    18_422n,
    versionHash,
    policyHash,
    85,
    ZeroAddress,
  );
  assert.equal(status, 3n);
});
