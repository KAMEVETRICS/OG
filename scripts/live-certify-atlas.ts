import { loadEnvFile } from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  formatEther,
  type InterfaceAbi,
  type Log,
} from "ethers";
import { assessAgent } from "../apps/assessor/src/assess.ts";
import { OgComputeAgent } from "../apps/assessor/src/og-compute-agent.ts";
import { canonicalize } from "../packages/core/src/canonical.ts";
import { loadPolicy } from "../packages/core/src/policy.ts";
import type { AssessmentReport } from "../packages/core/src/types.ts";
import { OgComputeRouterClient } from "../packages/og-compute/src/router-client.ts";
import { OgStorageEvidenceStore } from "../packages/og-storage/src/evidence-store.ts";

const CHAIN_ID = 16_661n;
const AGENT_REGISTRY_NAMESPACE = "eip155:16661";
const EXPLORER = "https://chainscan.0g.ai";
const IDENTITY_ABI = [
  "function register() external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
] as const;

interface Artifact {
  abi: InterfaceAbi;
}

interface ContractDeploymentManifest {
  chainId: string;
  deployer: string;
  contracts: {
    AgentSealRegistry: { address: string };
    AgentGate: { address: string };
  };
}

interface AgentIdentityRecord {
  schemaVersion: "1.0";
  network: "0g-mainnet";
  identityRegistry: string;
  owner: string;
  agentId: string;
  registrationTransaction: string;
  uriTransaction?: string;
  agentURI?: string;
  registrationFile: string;
}

interface SealRecord {
  schemaVersion: "1.0";
  network: "0g-mainnet";
  agentId: string;
  implementationHash: string;
  policyHash: string;
  assessmentHash: string;
  assessmentFile: string;
  computeRuns: number;
  storage: {
    rootHash: string;
    transactionHash: string;
    contentDigest: string;
  };
  seal: {
    sealId: string;
    registry: string;
    transactionHash: string;
    expiresAt: string;
  };
  gate: {
    address: string;
    admitted: boolean;
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) throw new Error(`${name} is required`);
  return value;
}

function privateKey(): string {
  const configured = requiredEnv("OG_PRIVATE_KEY");
  const normalized = configured.startsWith("0x") ? configured : `0x${configured}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("OG_PRIVATE_KEY must contain 32 bytes of hexadecimal data");
  }
  return normalized;
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function registrationCard(agentId: bigint, identityRegistry: string) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Atlas-0G",
    description:
      "A DeFi policy-enforcement agent assessed by AgentSeal with version-bound, TEE-verified evidence on 0G.",
    services: [
      {
        name: "AgentSeal",
        endpoint: `${EXPLORER}/address/${identityRegistry}`,
        version: "0.1.0",
      },
    ],
    x402Support: false,
    active: true,
    registrations: [
      {
        agentId: agentId.toString(),
        agentRegistry: `${AGENT_REGISTRY_NAMESPACE}:${identityRegistry}`,
      },
    ],
    supportedTrust: ["tee-attestation"],
  };
}

async function ensureIdentity(
  wallet: Wallet,
  identityRegistryAddress: string,
): Promise<AgentIdentityRecord> {
  const recordPath = resolve("deployments", "agents", "atlas-0g.json");
  const identity = new Contract(identityRegistryAddress, IDENTITY_ABI, wallet);

  try {
    const existing = await readJson<AgentIdentityRecord>(recordPath);
    const owner = (await identity.ownerOf(BigInt(existing.agentId))) as string;
    if (!sameAddress(owner, wallet.address)) {
      throw new Error("Saved Atlas ERC-8004 identity is not owned by the deployer");
    }
    console.log(`Reusing ERC-8004 Atlas agent ID ${existing.agentId}`);
    return existing;
  } catch (error) {
    if (error instanceof Error && error.message.includes("not owned")) throw error;
  }

  console.log("Registering Atlas with the ERC-8004 Identity Registry...");
  const registrationTransaction = await identity.register();
  const registrationReceipt = await registrationTransaction.wait();
  if (registrationReceipt === null || registrationReceipt.status !== 1) {
    throw new Error("ERC-8004 registration failed");
  }

  let agentId: bigint | undefined;
  for (const eventLog of registrationReceipt.logs as Log[]) {
    try {
      const parsed = identity.interface.parseLog(eventLog);
      if (parsed?.name === "Registered") {
        agentId = parsed.args.agentId as bigint;
        break;
      }
    } catch {
      // Ignore unrelated logs from the ERC-721 implementation.
    }
  }
  if (agentId === undefined) throw new Error("ERC-8004 Registered event was not found");

  const card = registrationCard(agentId, identityRegistryAddress);
  const registrationFile = resolve("deployments", "agents", "atlas-0g-registration.json");
  await writeJson(registrationFile, card);
  const agentURI = `data:application/json;base64,${Buffer.from(
    JSON.stringify(card),
  ).toString("base64")}`;
  const record: AgentIdentityRecord = {
    schemaVersion: "1.0",
    network: "0g-mainnet",
    identityRegistry: identityRegistryAddress,
    owner: wallet.address,
    agentId: agentId.toString(),
    registrationTransaction: registrationReceipt.hash,
    registrationFile,
  };
  await writeJson(recordPath, record);

  console.log(`Setting the ERC-8004 registration URI for agent ${agentId}...`);
  const uriTransaction = await identity.setAgentURI(agentId, agentURI);
  const uriReceipt = await uriTransaction.wait();
  if (uriReceipt === null || uriReceipt.status !== 1) {
    throw new Error("ERC-8004 URI update failed");
  }
  const storedURI = (await identity.tokenURI(agentId)) as string;
  if (storedURI !== agentURI) throw new Error("ERC-8004 URI read-back mismatch");
  record.uriTransaction = uriReceipt.hash;
  record.agentURI = agentURI;
  await writeJson(recordPath, record);
  console.log(`Registered Atlas as ERC-8004 agent ${agentId}`);
  return record;
}

async function saveAssessment(report: AssessmentReport): Promise<string> {
  const directory = resolve(".agentseal", "live");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, `atlas-${report.assessmentHash.slice(2, 14)}.json`);
  await writeFile(path, `${canonicalize(report)}\n`, "utf8");
  return path;
}

loadEnvFile(resolve(".env"));
const rpcUrl = requiredEnv("OG_RPC_URL");
const identityRegistryAddress = requiredEnv("ERC8004_IDENTITY_REGISTRY");
const provider = new JsonRpcProvider(rpcUrl);
const signer = new Wallet(privateKey(), provider);
const network = await provider.getNetwork();
if (network.chainId !== CHAIN_ID) throw new Error(`Expected 0G chain ${CHAIN_ID}`);

const balance = await provider.getBalance(signer.address);
console.log("AgentSeal live Atlas certification");
console.log(`  Signer:  ${signer.address}`);
console.log(`  Balance: ${formatEther(balance)} 0G`);

const deployment = await readJson<ContractDeploymentManifest>(
  resolve("deployments", "0g-mainnet.json"),
);
if (!sameAddress(deployment.deployer, signer.address)) {
  throw new Error("Configured signer does not own the AgentSeal deployment");
}

const identityRecord = await ensureIdentity(signer, identityRegistryAddress);
const policy = await loadPolicy(
  new URL("../benchmarks/defi-safe/v1/policy.json", import.meta.url),
);
const compute = new OgComputeRouterClient({
  apiKey: requiredEnv("OG_COMPUTE_API_KEY"),
  baseUrl: requiredEnv("OG_COMPUTE_BASE_URL"),
  model: requiredEnv("OG_COMPUTE_MODEL"),
});
const agent = new OgComputeAgent(BigInt(identityRecord.agentId), compute);

console.log(
  `Running ${policy.cases.length * policy.runsPerCase} TEE-verified 0G Compute checks...`,
);
const report = await assessAgent(agent, policy, {
  requireVerifiedCompute: true,
  onRunComplete(progress) {
    console.log(
      `  ${progress.caseId} run ${progress.run}/${progress.totalRuns}: ${
        progress.passed ? "PASS" : "FAIL"
      }`,
    );
  },
});
const assessmentFile = await saveAssessment(report);
console.log(
  `Assessment complete: ${report.safetyScore}/100, ${report.passedChecks}/${report.totalChecks}, ` +
    `${report.criticalFailures} critical failures`,
);

if (!report.certifiable) {
  console.log(`Assessment saved to ${assessmentFile}`);
  throw new Error("Atlas did not satisfy the live certification policy; no seal was issued");
}

console.log("Uploading the canonical assessment to 0G Storage...");
const storage = new OgStorageEvidenceStore({
  rpcUrl,
  indexerUrl: requiredEnv("OG_STORAGE_INDEXER_RPC"),
  privateKey: privateKey(),
});
const storageReceipt = await storage.put(report);
console.log(`  Storage root: ${storageReceipt.rootHash}`);
console.log(`  Storage tx:   ${storageReceipt.transactionHash}`);

const registryArtifact = await readJson<Artifact>(
  resolve(
    "artifacts/hardhat/contracts/src/AgentSealRegistry.sol/AgentSealRegistry.json",
  ),
);
const gateArtifact = await readJson<Artifact>(
  resolve("artifacts/hardhat/contracts/src/AgentGate.sol/AgentGate.json"),
);
const registry = new Contract(
  deployment.contracts.AgentSealRegistry.address,
  registryArtifact.abi,
  signer,
);
const gate = new Contract(deployment.contracts.AgentGate.address, gateArtifact.abi, provider);
const expiresAt = BigInt(Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60);

console.log("Issuing the version-bound AgentSeal on 0G mainnet...");
const sealTransaction = await registry.issueSeal({
  agentId: BigInt(report.agentId),
  versionHash: report.implementationHash,
  policyHash: report.policyHash,
  evidenceRoot: storageReceipt.rootHash,
  safetyScore: report.safetyScore,
  passedChecks: report.passedChecks,
  totalChecks: report.totalChecks,
  criticalFailures: report.criticalFailures,
  issuedAt: 0,
  expiresAt,
  issuer: ZeroAddress,
  revoked: false,
});
const sealReceipt = await sealTransaction.wait();
if (sealReceipt === null || sealReceipt.status !== 1) throw new Error("Seal issuance failed");

const [validationStatus, sealId] = (await registry.validateSeal(
  BigInt(report.agentId),
  report.implementationHash,
  report.policyHash,
  policy.minimumScore,
  signer.address,
)) as [bigint, bigint];
if (validationStatus !== 0n) throw new Error(`Seal validation status is ${validationStatus}`);
const admitted = (await gate.canExecute(
  BigInt(report.agentId),
  report.implementationHash,
)) as boolean;
if (!admitted) throw new Error("AgentGate rejected the newly issued seal");

const computeRuns = report.results.reduce((sum, result) => sum + result.runs.length, 0);
const sealRecord: SealRecord = {
  schemaVersion: "1.0",
  network: "0g-mainnet",
  agentId: report.agentId,
  implementationHash: report.implementationHash,
  policyHash: report.policyHash,
  assessmentHash: report.assessmentHash,
  assessmentFile,
  computeRuns,
  storage: {
    rootHash: storageReceipt.rootHash,
    transactionHash: storageReceipt.transactionHash,
    contentDigest: storageReceipt.contentDigest,
  },
  seal: {
    sealId: sealId.toString(),
    registry: deployment.contracts.AgentSealRegistry.address,
    transactionHash: sealReceipt.hash,
    expiresAt: expiresAt.toString(),
  },
  gate: {
    address: deployment.contracts.AgentGate.address,
    admitted,
  },
};
const sealRecordPath = resolve("deployments", "seals", "atlas-live.json");
await writeJson(sealRecordPath, sealRecord);

console.log("Atlas is AGENTSEALED");
console.log(`  ERC-8004 agent ID: ${report.agentId}`);
console.log(`  Seal ID:           ${sealId}`);
console.log(`  Score:             ${report.safetyScore}/100`);
console.log(`  Gate admitted:     ${admitted}`);
console.log(`  Seal transaction:  ${EXPLORER}/tx/${sealReceipt.hash}`);
console.log(`  Record:            ${sealRecordPath}`);
