import {
  AGENT_SEAL_REGISTRY_ABI,
  AgentSealClient,
  ATLAS_0G,
  OG_MAINNET,
  ROGUE_DEMO,
  type AgentIdentity,
} from '@agentseal/sdk';
import { Contract, getAddress, isAddress } from 'ethers';

import {
  discoverAssessmentPackage,
  validateAssessmentPackage,
} from './assessment';
import { getLatestAgentPackage } from './database';
import {
  findRegisteredAssessmentEndpoint,
  parseChainScanAgentIds,
} from './agent-package-discovery';
import {
  CertificationRequestError,
  certificationModelRevision,
  certifierProvider,
} from './server';
import type { AssessmentPackage, CurrentSeal, OwnedAgent } from './types';

const CHAINSCAN_TOKENS_URL = 'https://chainscan.0g.ai/open/nft/tokens';
const REGISTRY_START_BLOCK = 43_212_327;
const SEAL_QUERY_ABI = [
  ...AGENT_SEAL_REGISTRY_ABI,
  'event SealIssued(uint256 indexed sealId, uint256 indexed agentId, bytes32 indexed policyHash, bytes32 versionHash, bytes32 evidenceRoot, uint16 safetyScore, uint64 expiresAt, address issuer)',
] as const;

function fixtureHashesFor(agentId: string): string[] {
  const id = BigInt(agentId);
  const hashes: string[] = [];
  if (id === ATLAS_0G.agentId) hashes.push(ATLAS_0G.implementationHash);
  if (id === ROGUE_DEMO.agentId) hashes.push(ROGUE_DEMO.implementationHash);
  return hashes;
}

export async function findCurrentSeal(agentId: string): Promise<CurrentSeal | null> {
  const provider = certifierProvider();
  const client = new AgentSealClient({
    provider,
    identityRegistry:
      process.env.ERC8004_IDENTITY_REGISTRY?.trim() ||
      OG_MAINNET.identityRegistry,
  });
  const hashes = new Set(fixtureHashesFor(agentId));
  try {
    const registry = new Contract(
      OG_MAINNET.agentSealRegistry,
      SEAL_QUERY_ABI,
      provider,
    );
    const filter = registry.filters.SealIssued(
      null,
      BigInt(agentId),
      OG_MAINNET.policy.hash,
    );
    const logs = await registry.queryFilter(filter, REGISTRY_START_BLOCK);
    for (const log of logs) {
      const versionHash = (log as { args?: { versionHash?: string } }).args
        ?.versionHash;
      if (typeof versionHash === 'string') hashes.add(versionHash);
    }
  } catch (error) {
    console.error(
      `[certification] Seal lookup for agent ${agentId} fell back to known hashes:`,
      error instanceof Error ? error.message : error,
    );
  }

  let current: CurrentSeal | null = null;
  for (const implementationHash of hashes) {
    try {
      const validation = await client.validate({
        agentId,
        implementationHash,
      });
      if (validation.status !== 'valid' || !validation.seal) continue;
      const gateAdmitted = await client.canExecute(agentId, implementationHash);
      const candidate: CurrentSeal = {
        sealId: validation.seal.sealId.toString(),
        implementationHash,
        expiresAt: validation.seal.expiresAt.toISOString(),
        safetyScore: validation.seal.safetyScore,
        gateAdmitted,
      };
      if (!current || BigInt(candidate.sealId) > BigInt(current.sealId)) {
        current = candidate;
      }
    } catch (error) {
      console.error(
        `[certification] Seal ${implementationHash} for agent ${agentId} could not be read:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return current;
}

export interface ResolvedAgentPackage {
  assessmentPackage: AssessmentPackage;
  implementationHash: string;
  packageUrl: string;
  source: 'registered' | 'agentseal';
}

function identityClient(): AgentSealClient {
  return new AgentSealClient({
    provider: certifierProvider(),
    identityRegistry:
      process.env.ERC8004_IDENTITY_REGISTRY?.trim() ||
      OG_MAINNET.identityRegistry,
  });
}

function managedPackageUrl(
  origin: string,
  agentId: string,
  implementationHash: string,
): string {
  return `${origin}/api/agents/${agentId}/assessment-packages/${implementationHash}`;
}

async function chainscanAgentIds(owner: string): Promise<string[]> {
  const url = new URL(CHAINSCAN_TOKENS_URL);
  url.searchParams.set('owner', owner);
  url.searchParams.set(
    'contract',
    process.env.ERC8004_IDENTITY_REGISTRY?.trim() ||
      OG_MAINNET.identityRegistry,
  );
  url.searchParams.set('limit', '100');
  url.searchParams.set('withBrief', 'true');
  url.searchParams.set('withMetadata', 'true');
  url.searchParams.set('suppressMetadataError', 'true');
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });
  if (!response.ok)
    throw new CertificationRequestError(
      '0G agent discovery is temporarily unavailable.',
      503,
      'discovery_unavailable',
    );
  return parseChainScanAgentIds(await response.json());
}

export async function resolveAgentPackage(
  identity: AgentIdentity,
  origin: string,
): Promise<ResolvedAgentPackage | null> {
  const agentId = identity.agentId.toString();
  const owner = getAddress(identity.owner).toLowerCase();
  const stored = await getLatestAgentPackage(agentId, owner);
  if (stored) {
    try {
      const assessmentPackage = validateAssessmentPackage(
        JSON.parse(stored.package_json) as unknown,
        stored.implementation_hash,
        certificationModelRevision(),
      );
      return {
        assessmentPackage,
        implementationHash: stored.implementation_hash,
        packageUrl: managedPackageUrl(
          origin,
          agentId,
          stored.implementation_hash,
        ),
        source: 'agentseal',
      };
    } catch (error) {
      console.error(
        '[certification] Stored package failed validation:',
        error instanceof Error ? error.message : error,
      );
    }
  }

  const endpoint = findRegisteredAssessmentEndpoint(identity.metadata);
  if (!endpoint) return null;
  try {
    const discovered = await discoverAssessmentPackage(
      endpoint,
      certificationModelRevision(),
    );
    return { ...discovered, packageUrl: endpoint, source: 'registered' };
  } catch (error) {
    console.error(
      '[certification] Registered package failed validation:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function toOwnedAgent(
  identity: AgentIdentity,
  origin: string,
): Promise<OwnedAgent> {
  const agentId = identity.agentId.toString();
  const [resolved, currentSeal] = await Promise.all([
    resolveAgentPackage(identity, origin),
    findCurrentSeal(agentId),
  ]);
  return {
    agentId,
    name:
      typeof identity.metadata?.name === 'string' &&
      identity.metadata.name.trim()
        ? identity.metadata.name.trim().slice(0, 120)
        : `Agent #${identity.agentId}`,
    description:
      typeof identity.metadata?.description === 'string' &&
      identity.metadata.description.trim()
        ? identity.metadata.description.trim().slice(0, 300)
        : null,
    active: identity.metadata?.active !== false,
    packageReady: resolved !== null,
    implementationHash:
      resolved?.implementationHash ?? currentSeal?.implementationHash ?? null,
    packageSource: resolved?.source ?? null,
    currentSeal,
  };
}

export async function getOwnedAgent(
  agentId: string,
  ownerInput: string,
  origin: string,
): Promise<OwnedAgent> {
  if (!/^[1-9][0-9]*$/.test(agentId))
    throw new CertificationRequestError('Enter a valid ERC-8004 agent ID.');
  if (!isAddress(ownerInput))
    throw new CertificationRequestError('Connect a valid EVM owner wallet.');
  const owner = getAddress(ownerInput);
  const identity = await identityClient().getIdentity(agentId);
  if (!identity)
    throw new CertificationRequestError(
      'No ERC-8004 identity was found for this agent ID.',
      404,
      'identity_not_found',
    );
  if (getAddress(identity.owner) !== owner) {
    throw new CertificationRequestError(
      'This ERC-8004 agent is not owned by the connected wallet.',
      403,
      'owner_mismatch',
    );
  }
  return toOwnedAgent(identity, origin);
}

export async function listOwnedAgents(
  ownerInput: string,
  origin: string,
): Promise<OwnedAgent[]> {
  if (!isAddress(ownerInput))
    throw new CertificationRequestError('Connect a valid EVM owner wallet.');
  const owner = getAddress(ownerInput);
  const ids = await chainscanAgentIds(owner);
  const client = identityClient();
  const verified = await Promise.all(
    ids.map(async (agentId) => {
      try {
        const identity = await client.getIdentity(agentId);
        if (!identity || getAddress(identity.owner) !== owner) return null;
        return await toOwnedAgent(identity, origin);
      } catch (error) {
        console.error(
          `[certification] Agent ${agentId} discovery failed:`,
          error instanceof Error ? error.message : error,
        );
        return null;
      }
    }),
  );
  return verified
    .filter((agent): agent is OwnedAgent => agent !== null)
    .sort((left, right) =>
      BigInt(left.agentId) < BigInt(right.agentId) ? -1 : 1,
    );
}

export async function getVerifiedIdentity(
  agentId: string,
  owner?: string,
): Promise<AgentIdentity> {
  if (!/^[1-9][0-9]*$/.test(agentId))
    throw new CertificationRequestError('Enter a valid ERC-8004 agent ID.');
  const identity = await identityClient().getIdentity(agentId);
  if (!identity)
    throw new CertificationRequestError(
      'No ERC-8004 identity was found for this agent ID.',
      404,
      'identity_not_found',
    );
  if (owner && getAddress(identity.owner) !== getAddress(owner)) {
    throw new CertificationRequestError(
      'This ERC-8004 agent is not owned by the connected wallet.',
      403,
      'owner_mismatch',
    );
  }
  return identity;
}
