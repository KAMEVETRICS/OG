import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import { Contract, JsonRpcProvider, type InterfaceAbi } from "ethers";
import { canonicalize } from "../packages/core/src/canonical.ts";
import type { AssessmentReport } from "../packages/core/src/types.ts";
import { prepareEvidence } from "../packages/og-storage/src/evidence-store.ts";

const IDENTITY_ABI = [
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function tokenURI(uint256 agentId) external view returns (string)",
] as const;

interface Artifact {
  abi: InterfaceAbi;
}

interface DeploymentManifest {
  deployer: string;
  contracts: {
    AgentSealRegistry: { address: string };
    AgentGate: { address: string };
  };
}

interface AgentRecord {
  identityRegistry: string;
  owner: string;
  agentId: string;
  agentURI: string;
}

interface SealRecord {
  agentId: string;
  implementationHash: string;
  policyHash: string;
  assessmentFile: string;
  computeRuns: number;
  storage: { rootHash: string; transactionHash: string };
  seal: { sealId: string; transactionHash: string; expiresAt: string };
  gate: { admitted: boolean };
}

interface OnchainSeal {
  agentId: bigint;
  versionHash: string;
  policyHash: string;
  evidenceRoot: string;
  safetyScore: bigint;
  passedChecks: bigint;
  totalChecks: bigint;
  criticalFailures: bigint;
  issuedAt: bigint;
  expiresAt: bigint;
  issuer: string;
  revoked: boolean;
}

function requireCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Live seal verification failed: ${message}`);
}

function same(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

loadEnvFile(resolve(".env"));
const rpcUrl = process.env.OG_RPC_URL?.trim();
const indexerUrl = process.env.OG_STORAGE_INDEXER_RPC?.trim();
if (!rpcUrl || !indexerUrl) throw new Error("0G RPC and Storage indexer URLs are required");

const deployment = await readJson<DeploymentManifest>(
  resolve("deployments", "0g-mainnet.json"),
);
const agent = await readJson<AgentRecord>(
  resolve("deployments", "agents", "atlas-0g.json"),
);
const record = await readJson<SealRecord>(
  resolve("deployments", "seals", "atlas-live.json"),
);
const report = await readJson<AssessmentReport>(record.assessmentFile);
const registryArtifact = await readJson<Artifact>(
  resolve(
    "artifacts/hardhat/contracts/src/AgentSealRegistry.sol/AgentSealRegistry.json",
  ),
);
const gateArtifact = await readJson<Artifact>(
  resolve("artifacts/hardhat/contracts/src/AgentGate.sol/AgentGate.json"),
);

const provider = new JsonRpcProvider(rpcUrl);
const identity = new Contract(agent.identityRegistry, IDENTITY_ABI, provider);
const registry = new Contract(
  deployment.contracts.AgentSealRegistry.address,
  registryArtifact.abi,
  provider,
);
const gate = new Contract(deployment.contracts.AgentGate.address, gateArtifact.abi, provider);

const [owner, tokenURI, sealTransaction, storageTransaction, validation, onchainSeal, admitted] =
  await Promise.all([
    identity.ownerOf(BigInt(agent.agentId)) as Promise<string>,
    identity.tokenURI(BigInt(agent.agentId)) as Promise<string>,
    provider.getTransactionReceipt(record.seal.transactionHash),
    provider.getTransactionReceipt(record.storage.transactionHash),
    registry.validateSeal(
      BigInt(record.agentId),
      record.implementationHash,
      record.policyHash,
      85,
      deployment.deployer,
    ) as Promise<[bigint, bigint]>,
    registry.seals(BigInt(record.seal.sealId)) as Promise<OnchainSeal>,
    gate.canExecute(
      BigInt(record.agentId),
      record.implementationHash,
    ) as Promise<boolean>,
  ]);

requireCondition(same(owner, agent.owner), "ERC-8004 owner mismatch");
requireCondition(tokenURI === agent.agentURI, "ERC-8004 registration URI mismatch");
requireCondition(sealTransaction?.status === 1, "seal transaction is not successful");
requireCondition(storageTransaction?.status === 1, "Storage transaction is not successful");
requireCondition(validation[0] === 0n, `seal status is ${validation[0]}`);
requireCondition(validation[1].toString() === record.seal.sealId, "seal ID mismatch");
requireCondition(onchainSeal.agentId.toString() === record.agentId, "agent ID mismatch");
requireCondition(
  same(onchainSeal.versionHash, record.implementationHash),
  "implementation hash mismatch",
);
requireCondition(same(onchainSeal.policyHash, record.policyHash), "policy hash mismatch");
requireCondition(
  same(onchainSeal.evidenceRoot, record.storage.rootHash),
  "evidence root mismatch",
);
requireCondition(onchainSeal.safetyScore === 100n, "onchain score is not 100");
requireCondition(onchainSeal.criticalFailures === 0n, "onchain critical failures are nonzero");
requireCondition(!onchainSeal.revoked, "seal is revoked");
requireCondition(onchainSeal.expiresAt === BigInt(record.seal.expiresAt), "expiry mismatch");
requireCondition(admitted && record.gate.admitted, "AgentGate did not admit Atlas");
requireCondition(report.provenanceComplete, "assessment provenance is incomplete");
requireCondition(
  report.results.flatMap((result) => result.runs).length === record.computeRuns,
  "Compute run count mismatch",
);

const prepared = await prepareEvidence(report);
requireCondition(same(prepared.rootHash, record.storage.rootHash), "local Storage root mismatch");
const indexer = new Indexer(indexerUrl);
const [evidenceBlob, downloadError] = await indexer.downloadToBlob(
  record.storage.rootHash,
  { proof: true },
);
if (downloadError !== null) throw downloadError;
const downloadedEvidence = await evidenceBlob.text();
requireCondition(
  downloadedEvidence === canonicalize(report),
  "downloaded Storage evidence does not match the assessment",
);

console.log("AgentSeal live certification independently verified");
console.log(`  ERC-8004 agent ID: ${record.agentId}`);
console.log(`  Compute receipts:  ${record.computeRuns}/45 verified`);
console.log(`  Storage root:      ${record.storage.rootHash}`);
console.log(`  Seal ID:           ${record.seal.sealId}`);
console.log(`  Score:             ${onchainSeal.safetyScore}/100`);
console.log(`  Expires at:        ${new Date(Number(onchainSeal.expiresAt) * 1000).toISOString()}`);
console.log(`  Gate admitted:     ${admitted}`);
