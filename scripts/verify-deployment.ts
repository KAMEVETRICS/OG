import { loadEnvFile } from "node:process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, type InterfaceAbi } from "ethers";

interface Artifact {
  abi: InterfaceAbi;
}

interface DeploymentManifest {
  status: string;
  chainId: string;
  deployer: string;
  policy: { hash: string; minimumScore: number };
  contracts: {
    AgentSealRegistry: { address: string; transactionHash: string };
    AgentGate: { address: string; transactionHash: string };
  };
}

function equalAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function assertCondition(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Deployment verification failed: ${message}`);
}

loadEnvFile(resolve(".env"));
const rpcUrl = process.env.OG_RPC_URL?.trim();
if (rpcUrl === undefined || rpcUrl.length === 0) throw new Error("OG_RPC_URL is required");

const manifest = JSON.parse(
  await readFile(resolve("deployments", "0g-mainnet.json"), "utf8"),
) as DeploymentManifest;
const registryArtifact = JSON.parse(
  await readFile(
    resolve(
      "artifacts/hardhat/contracts/src/AgentSealRegistry.sol/AgentSealRegistry.json",
    ),
    "utf8",
  ),
) as Artifact;
const gateArtifact = JSON.parse(
  await readFile(
    resolve("artifacts/hardhat/contracts/src/AgentGate.sol/AgentGate.json"),
    "utf8",
  ),
) as Artifact;

const provider = new JsonRpcProvider(rpcUrl);
const network = await provider.getNetwork();
assertCondition(network.chainId.toString() === manifest.chainId, "chain ID mismatch");
assertCondition(manifest.status === "complete", "manifest is not complete");

const registryAddress = manifest.contracts.AgentSealRegistry.address;
const gateAddress = manifest.contracts.AgentGate.address;
const [registryCode, gateCode, registryReceipt, gateReceipt] = await Promise.all([
  provider.getCode(registryAddress),
  provider.getCode(gateAddress),
  provider.getTransactionReceipt(manifest.contracts.AgentSealRegistry.transactionHash),
  provider.getTransactionReceipt(manifest.contracts.AgentGate.transactionHash),
]);
assertCondition(registryCode !== "0x", "registry bytecode is missing");
assertCondition(gateCode !== "0x", "gate bytecode is missing");
assertCondition(registryReceipt?.status === 1, "registry transaction did not succeed");
assertCondition(gateReceipt?.status === 1, "gate transaction did not succeed");

const registry = new Contract(registryAddress, registryArtifact.abi, provider);
const gate = new Contract(gateAddress, gateArtifact.abi, provider);
const [owner, issuerAuthorized, configuredRegistry, configuredPolicy, minimumScore, trustedIssuer] =
  await Promise.all([
    registry.owner() as Promise<string>,
    registry.isIssuer(manifest.deployer) as Promise<boolean>,
    gate.registry() as Promise<string>,
    gate.policyHash() as Promise<string>,
    gate.minimumScore() as Promise<bigint>,
    gate.trustedIssuer() as Promise<string>,
  ]);

assertCondition(equalAddress(owner, manifest.deployer), "registry owner mismatch");
assertCondition(issuerAuthorized, "deployer is not an authorized issuer");
assertCondition(equalAddress(configuredRegistry, registryAddress), "gate registry mismatch");
assertCondition(configuredPolicy.toLowerCase() === manifest.policy.hash.toLowerCase(), "gate policy mismatch");
assertCondition(minimumScore === BigInt(manifest.policy.minimumScore), "gate score mismatch");
assertCondition(equalAddress(trustedIssuer, manifest.deployer), "gate issuer mismatch");

console.log("AgentSeal 0G mainnet deployment verified");
console.log(`  Registry:      ${registryAddress}`);
console.log(`  Registry code: ${(registryCode.length - 2) / 2} bytes`);
console.log(`  Gate:          ${gateAddress}`);
console.log(`  Gate code:     ${(gateCode.length - 2) / 2} bytes`);
console.log(`  Owner/issuer:  ${manifest.deployer}`);
console.log(`  Policy hash:   ${configuredPolicy}`);
console.log(`  Minimum score: ${minimumScore}`);
