import { ATLAS_0G, ROGUE_DEMO } from '@agentseal/sdk';

/** Known Wave 3 demo identities. Used only as seal-hash hints, never injected into owner discovery. */
export function fixtureHashesFor(agentId: string): string[] {
  const id = BigInt(agentId);
  const hashes: string[] = [];
  if (id === ATLAS_0G.agentId) hashes.push(ATLAS_0G.implementationHash);
  if (id === ROGUE_DEMO.agentId) hashes.push(ROGUE_DEMO.implementationHash);
  return hashes;
}
