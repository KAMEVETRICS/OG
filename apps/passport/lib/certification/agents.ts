import { AgentSealClient, OG_MAINNET, type AgentIdentity } from '@agentseal/sdk';
import { getAddress, isAddress } from 'ethers';

import { validateAssessmentPackage } from './assessment';
import { getLatestAgentPackage } from './database';
import { parseChainScanAgentIds } from './agent-package-discovery';
import { certificationModelRevision, certifierProvider } from './env';
import { CertificationRequestError } from './errors';
import type { AssessmentPackage, CurrentSeal, OwnedAgent } from './types';

const CHAINSCAN_TOKENS_URL = 'https://chainscan.0g.ai/open/nft/tokens';

export async function findCurrentSeal(
  agentId: string,
  implementationHash?: string | null,
): Promise<CurrentSeal | null> {
  if (!implementationHash) return null;
  const found = await identityClient().currentValidSeal(agentId, [implementationHash]);
  if (!found) return null;
  return {
    sealId: found.sealId.toString(),
    implementationHash: found.implementationHash,
    expiresAt: found.seal.expiresAt.toISOString(),
    safetyScore: found.seal.safetyScore,
    gateAdmitted: found.gateAdmitted,
  };
}

function identityClient(): AgentSealClient {
  return new AgentSealClient({
    provider: certifierProvider(),
    identityRegistry:
      process.env.ERC8004_IDENTITY_REGISTRY?.trim() ||
      OG_MAINNET.identityRegistry,
  });
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

export async function resolveStoredPackage(
  agentId: string,
  owner: string,
): Promise<{
  assessmentPackage: AssessmentPackage;
  implementationHash: string;
} | null> {
  const stored = await getLatestAgentPackage(agentId, owner);
  if (!stored) return null;
  try {
    return {
      assessmentPackage: validateAssessmentPackage(
        JSON.parse(stored.package_json) as unknown,
        stored.implementation_hash,
        certificationModelRevision(),
      ),
      implementationHash: stored.implementation_hash,
    };
  } catch (error) {
    console.error(
      '[certification] Stored package failed validation:',
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

async function toOwnedAgent(identity: AgentIdentity): Promise<OwnedAgent> {
  const agentId = identity.agentId.toString();
  const owner = getAddress(identity.owner).toLowerCase();
  const stored = await resolveStoredPackage(agentId, owner);
  const currentSeal = await findCurrentSeal(agentId, stored?.implementationHash);
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
    packageReady: stored !== null,
    implementationHash: stored?.implementationHash ?? null,
    packageSource: stored ? 'agentseal' : null,
    currentSeal,
  };
}

export async function getOwnedAgent(
  agentId: string,
  ownerInput: string,
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
  return toOwnedAgent(identity);
}

export async function listOwnedAgents(ownerInput: string): Promise<OwnedAgent[]> {
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
        return await toOwnedAgent(identity);
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
