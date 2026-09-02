import { loadEnvFile } from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ContractFactory,
  JsonRpcProvider,
  Wallet,
  formatEther,
  getCreateAddress,
  type InterfaceAbi,
} from "ethers";
import { policyFingerprint } from "../packages/core/src/fingerprint.ts";
import { loadPolicy } from "../packages/core/src/policy.ts";

const EXPECTED_CHAIN_ID = 16_661n;
const EXPLORER_BASE_URL = "https://chainscan.0g.ai";

interface Artifact {
  abi: InterfaceAbi;
  bytecode: string;
}

interface ContractDeployment {
  address: string;
  transactionHash: string;
  blockNumber: number;
}

interface DeploymentManifest {
  schemaVersion: "1.0";
  status: "registry-deployed" | "complete";
  network: "0g-mainnet";
  chainId: string;
  deployer: string;
  policy: {
    id: string;
    version: string;
    hash: string;
    minimumScore: number;
  };
  deployedAt: string;
  contracts: {
    AgentSealRegistry: ContractDeployment;
    AgentGate?: ContractDeployment;
  };
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required in .env`);
  }
  return value;
}

function loadPrivateKey(): string {
  const configured = requiredEnv("OG_PRIVATE_KEY");
  const normalized = configured.startsWith("0x") ? configured : `0x${configured}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("OG_PRIVATE_KEY must contain exactly 32 bytes of hexadecimal data");
  }
  return normalized;
}

async function loadArtifact(relativePath: string): Promise<Artifact> {
  return JSON.parse(await readFile(resolve(relativePath), "utf8")) as Artifact;
}

async function saveManifest(manifest: DeploymentManifest): Promise<string> {
  const directory = resolve("deployments");
  await mkdir(directory, { recursive: true });
  const path = resolve(directory, "0g-mainnet.json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return path;
}

loadEnvFile(resolve(".env"));

const rpcUrl = requiredEnv("OG_RPC_URL");
const privateKey = loadPrivateKey();
const provider = new JsonRpcProvider(rpcUrl);
const wallet = new Wallet(privateKey, provider);
const network = await provider.getNetwork();

if (network.chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `Refusing deployment: expected chain ${EXPECTED_CHAIN_ID}, received ${network.chainId}`,
  );
}

const policy = await loadPolicy(
  new URL("../benchmarks/defi-safe/v1/policy.json", import.meta.url),
);
const policyHash = policyFingerprint(policy);
const registryArtifact = await loadArtifact(
  "artifacts/hardhat/contracts/src/AgentSealRegistry.sol/AgentSealRegistry.json",
);
const gateArtifact = await loadArtifact(
  "artifacts/hardhat/contracts/src/AgentGate.sol/AgentGate.json",
);

const balance = await provider.getBalance(wallet.address);
const nonce = await provider.getTransactionCount(wallet.address, "pending");
const predictedRegistry = getCreateAddress({ from: wallet.address, nonce });
const registryFactory = new ContractFactory(
  registryArtifact.abi,
  registryArtifact.bytecode,
  wallet,
);
const gateFactory = new ContractFactory(gateArtifact.abi, gateArtifact.bytecode, wallet);
const registryRequest = await registryFactory.getDeployTransaction(wallet.address);
const gateRequest = await gateFactory.getDeployTransaction(
  predictedRegistry,
  policyHash,
  policy.minimumScore,
  wallet.address,
);
const registryGas = await provider.estimateGas({
  ...registryRequest,
  from: wallet.address,
});
const gateGas = await provider.estimateGas({ ...gateRequest, from: wallet.address });
const totalGas = registryGas + gateGas;
const feeData = await provider.getFeeData();
const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
if (gasPrice === null) throw new Error("RPC did not return a usable gas price");
const estimatedMaximumCost = (totalGas * gasPrice * 120n) / 100n;

console.log("AgentSeal 0G mainnet deployment preflight");
console.log(`  Chain ID:                 ${network.chainId}`);
console.log(`  Deployer:                 ${wallet.address}`);
console.log(`  Balance:                  ${formatEther(balance)} 0G`);
console.log(`  Policy:                   ${policy.id}@${policy.version}`);
console.log(`  Policy hash:              ${policyHash}`);
console.log(`  Registry gas estimate:    ${registryGas}`);
console.log(`  Gate gas estimate:        ${gateGas}`);
console.log(`  Buffered maximum cost:    ${formatEther(estimatedMaximumCost)} 0G`);
console.log(`  Predicted registry:       ${predictedRegistry}`);

if (balance < estimatedMaximumCost) {
  throw new Error(
    `Insufficient 0G balance: need approximately ${formatEther(estimatedMaximumCost)} 0G`,
  );
}

if (process.argv.includes("--preflight")) {
  console.log("Preflight passed; no transactions were sent.");
  process.exit(0);
}
if (!process.argv.includes("--yes")) {
  throw new Error("Pass --yes to authorize mainnet deployment transactions");
}

console.log("Deploying AgentSealRegistry...");
const registry = await registryFactory.deploy(wallet.address);
await registry.waitForDeployment();
const registryTransaction = registry.deploymentTransaction();
if (registryTransaction === null) throw new Error("Missing registry deployment transaction");
const registryReceipt = await registryTransaction.wait();
if (registryReceipt === null || registryReceipt.status !== 1) {
  throw new Error("AgentSealRegistry deployment failed");
}
const registryDeployment: ContractDeployment = {
  address: await registry.getAddress(),
  transactionHash: registryReceipt.hash,
  blockNumber: registryReceipt.blockNumber,
};

const manifest: DeploymentManifest = {
  schemaVersion: "1.0",
  status: "registry-deployed",
  network: "0g-mainnet",
  chainId: EXPECTED_CHAIN_ID.toString(),
  deployer: wallet.address,
  policy: {
    id: policy.id,
    version: policy.version,
    hash: policyHash,
    minimumScore: policy.minimumScore,
  },
  deployedAt: new Date().toISOString(),
  contracts: { AgentSealRegistry: registryDeployment },
};
await saveManifest(manifest);
console.log(`  Registry: ${registryDeployment.address}`);
console.log(`  Explorer: ${EXPLORER_BASE_URL}/tx/${registryDeployment.transactionHash}`);

console.log("Deploying AgentGate...");
const gate = await gateFactory.deploy(
  registryDeployment.address,
  policyHash,
  policy.minimumScore,
  wallet.address,
);
await gate.waitForDeployment();
const gateTransaction = gate.deploymentTransaction();
if (gateTransaction === null) throw new Error("Missing gate deployment transaction");
const gateReceipt = await gateTransaction.wait();
if (gateReceipt === null || gateReceipt.status !== 1) {
  throw new Error("AgentGate deployment failed");
}
const gateDeployment: ContractDeployment = {
  address: await gate.getAddress(),
  transactionHash: gateReceipt.hash,
  blockNumber: gateReceipt.blockNumber,
};
manifest.status = "complete";
manifest.contracts.AgentGate = gateDeployment;
const manifestPath = await saveManifest(manifest);

console.log(`  Gate:     ${gateDeployment.address}`);
console.log(`  Explorer: ${EXPLORER_BASE_URL}/tx/${gateDeployment.transactionHash}`);
console.log(`Deployment manifest: ${manifestPath}`);
