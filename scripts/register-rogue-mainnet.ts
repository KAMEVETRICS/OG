import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { Contract, JsonRpcProvider, Wallet, formatEther } from "ethers";

const CHAIN_ID = 16_661n;
const AGENT_REGISTRY_NAMESPACE = "eip155:16661";
const PASSPORT_URL = "https://agentseal-passport.gabrieltopeawe.chatgpt.site";
const IDENTITY_ABI = [
  "function register() external returns (uint256 agentId)",
  "function setAgentURI(uint256 agentId, string newURI) external",
  "function ownerOf(uint256 agentId) external view returns (address)",
  "function tokenURI(uint256 agentId) external view returns (string)",
  "event Registered(uint256 indexed agentId, string agentURI, address indexed owner)",
] as const;

interface RogueIdentityRecord {
  schemaVersion: "1.0";
  network: "0g-mainnet";
  identityRegistry: string;
  owner: string;
  agentId: string;
  registrationTransaction: string;
  uriTransaction: string;
  agentURI: string;
  certificationStatus: "denied";
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function configuredPrivateKey(): string {
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

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function registrationCard(agentId: bigint, identityRegistry: string) {
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "Rogue-0G",
    description:
      "An intentionally unsafe DeFi reference agent registered to demonstrate AgentSeal's fail-closed certification and policy gating.",
    services: [
      {
        name: "AgentSeal Passport",
        endpoint: `${PASSPORT_URL}/inspect`,
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

async function main(): Promise<void> {
  loadEnvFile(resolve(".env"));
  const rpcUrl = requiredEnv("OG_RPC_URL");
  const identityRegistry = requiredEnv("ERC8004_IDENTITY_REGISTRY");
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== CHAIN_ID) {
    throw new Error(`Expected 0G mainnet chain ${CHAIN_ID}, received ${network.chainId}`);
  }

  const wallet = new Wallet(configuredPrivateKey(), provider);
  const identity = new Contract(identityRegistry, IDENTITY_ABI, wallet);
  const recordPath = resolve("deployments", "agents", "rogue-0g.json");

  if (await exists(recordPath)) {
    const record = JSON.parse(await readFile(recordPath, "utf8")) as RogueIdentityRecord;
    const [owner, tokenUri] = await Promise.all([
      identity.ownerOf(BigInt(record.agentId)) as Promise<string>,
      identity.tokenURI(BigInt(record.agentId)) as Promise<string>,
    ]);
    if (!sameAddress(owner, record.owner) || tokenUri !== record.agentURI) {
      throw new Error("Existing Rogue identity record does not match mainnet");
    }
    console.log(`Rogue-0G is already registered as ERC-8004 agent ${record.agentId}`);
    return;
  }

  const balance = await provider.getBalance(wallet.address);
  console.log(`Registering Rogue-0G from ${wallet.address}`);
  console.log(`Wallet balance: ${formatEther(balance)} 0G`);

  const registrationTransaction = await identity.register();
  const registrationReceipt = await registrationTransaction.wait();
  if (registrationReceipt?.status !== 1) throw new Error("Rogue registration failed");

  let agentId: bigint | undefined;
  for (const log of registrationReceipt.logs) {
    try {
      const parsed = identity.interface.parseLog({ data: log.data, topics: [...log.topics] });
      if (parsed?.name === "Registered") {
        agentId = parsed.args.agentId as bigint;
        break;
      }
    } catch {
      // Ignore unrelated receipt logs.
    }
  }
  if (agentId === undefined) throw new Error("Registered event did not contain an agent ID");

  const agentURI = `data:application/json;base64,${Buffer.from(
    JSON.stringify(registrationCard(agentId, identityRegistry)),
  ).toString("base64")}`;
  const uriTransaction = await identity.setAgentURI(agentId, agentURI);
  const uriReceipt = await uriTransaction.wait();
  if (uriReceipt?.status !== 1) throw new Error("Rogue URI update failed");

  const [owner, storedURI] = await Promise.all([
    identity.ownerOf(agentId) as Promise<string>,
    identity.tokenURI(agentId) as Promise<string>,
  ]);
  if (!sameAddress(owner, wallet.address) || storedURI !== agentURI) {
    throw new Error("Rogue identity read-back failed");
  }

  const record: RogueIdentityRecord = {
    schemaVersion: "1.0",
    network: "0g-mainnet",
    identityRegistry,
    owner,
    agentId: agentId.toString(),
    registrationTransaction: registrationReceipt.hash,
    uriTransaction: uriReceipt.hash,
    agentURI,
    certificationStatus: "denied",
  };
  await writeJson(recordPath, record);

  console.log("Rogue-0G registered and intentionally left unsealed");
  console.log(`  ERC-8004 agent ID: ${record.agentId}`);
  console.log(`  Registration tx:   ${record.registrationTransaction}`);
  console.log(`  URI update tx:     ${record.uriTransaction}`);
}

await main();
