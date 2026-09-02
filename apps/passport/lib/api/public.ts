import {
  AgentSealClient,
  OG_MAINNET,
  type AgentPassport,
} from '@agentseal/sdk';

import { InputError, parseAgentId, parseImplementationHash, sanitizeMetadata, singleQuery, truncate } from './input.ts';

export const PUBLIC_API_TIMEOUT_MS = 12_000;

export const PUBLIC_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
} as const;

export function publicJson(body: unknown, status = 200, cache: 'public' | 'none' = 'none'): Response {
  return Response.json(body, {
    status,
    headers: {
      ...PUBLIC_CORS_HEADERS,
      'Cache-Control':
        cache === 'public' ? 'public, max-age=15, stale-while-revalidate=45' : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export function publicOptions(): Response {
  return new Response(null, { status: 204, headers: PUBLIC_CORS_HEADERS });
}

export function publicError(error: unknown): Response {
  if (error instanceof InputError) {
    return publicJson({ error: error.message, code: error.code }, error.status);
  }
  console.error('[public-api]', error instanceof Error ? error.message : error);
  return publicJson(
    {
      error: 'The 0G RPC could not be reached. Verification failed closed; retry in a moment.',
      code: 'rpc_unavailable',
    },
    503,
  );
}

function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('0G RPC request timed out')), milliseconds);
    }),
  ]);
}

export function parseVerifyQuery(
  agentIdParam: string,
  searchParams: URLSearchParams,
): { agentId: bigint; implementationHash: string } {
  const implementationHash =
    singleQuery(searchParams, 'implementationHash') ??
    singleQuery(searchParams, 'versionHash');
  if (implementationHash === null) {
    throw new InputError(
      'Query parameter implementationHash is required.',
      'invalid_implementation_hash',
    );
  }
  return {
    agentId: parseAgentId(agentIdParam),
    implementationHash: parseImplementationHash(implementationHash),
  };
}

export function serializePassport(passport: AgentPassport) {
  const seal = passport.validation.seal;
  return {
    agentId: passport.agentId.toString(),
    implementationHash: passport.implementationHash,
    safeToIntegrate: passport.safeToIntegrate,
    gateAdmitted: passport.gateAdmitted,
    identity: passport.identity
      ? {
          agentId: passport.identity.agentId.toString(),
          owner: passport.identity.owner,
          tokenUri: truncate(passport.identity.tokenUri),
          metadata: sanitizeMetadata(
            passport.identity.metadata as Record<string, unknown> | null,
          ),
        }
      : null,
    validation: {
      status: passport.validation.status,
      sealId: passport.validation.sealId?.toString() ?? null,
      seal: seal
        ? {
            sealId: seal.sealId.toString(),
            agentId: seal.agentId.toString(),
            versionHash: seal.versionHash,
            policyHash: seal.policyHash,
            evidenceRoot: seal.evidenceRoot,
            safetyScore: seal.safetyScore,
            passedChecks: seal.passedChecks,
            totalChecks: seal.totalChecks,
            criticalFailures: seal.criticalFailures,
            issuedAt: seal.issuedAt.toISOString(),
            expiresAt: seal.expiresAt.toISOString(),
            issuer: seal.issuer,
            revoked: seal.revoked,
          }
        : null,
    },
    policy: OG_MAINNET.policy,
    checkedAt: passport.checkedAt.toISOString(),
  };
}

export async function loadPublicPassport(
  agentId: bigint,
  implementationHash: string,
): Promise<AgentPassport> {
  const client = new AgentSealClient({
    rpcUrl: process.env.OG_RPC_URL ?? OG_MAINNET.rpcUrl,
  });
  return timeout(
    client.verifyAgent({ agentId, implementationHash }),
    PUBLIC_API_TIMEOUT_MS,
  );
}
