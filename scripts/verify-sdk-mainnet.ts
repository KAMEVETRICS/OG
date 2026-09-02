import { loadEnvFile } from "node:process";
import { resolve } from "node:path";
import { AgentSealClient, ATLAS_0G, ROGUE_DEMO } from "../packages/sdk/src/index.ts";

loadEnvFile(resolve(".env"));

const client = new AgentSealClient({ rpcUrl: process.env.OG_RPC_URL });
const [atlas, rogue] = await Promise.all([
  client.verifyAgent({
    agentId: ATLAS_0G.agentId,
    implementationHash: ATLAS_0G.implementationHash,
  }),
  client.verifyAgent({
    agentId: ROGUE_DEMO.agentId,
    implementationHash: ROGUE_DEMO.implementationHash,
  }),
]);

if (!atlas.safeToIntegrate || atlas.validation.status !== "valid") {
  throw new Error(`Atlas SDK verification failed closed: ${atlas.validation.status}`);
}
if (!rogue.identity) {
  throw new Error("Rogue ERC-8004 identity was not found");
}
if (rogue.validation.status !== "missing" || rogue.safeToIntegrate || rogue.gateAdmitted) {
  throw new Error("Rogue was unexpectedly admitted");
}

console.log("AgentSeal SDK mainnet verification passed");
console.log(`  Atlas: ${atlas.validation.status}, gate=${atlas.gateAdmitted}`);
console.log(`  Rogue: ${rogue.validation.status}, gate=${rogue.gateAdmitted}`);
