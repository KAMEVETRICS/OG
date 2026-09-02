import {
  AgentSealClient,
  OG_MAINNET,
  type AgentPassport,
} from '@agentseal/sdk';

import { InputError, parseAgentId, parseImplementationHash } from './api/input.ts';

export interface PassportQuery {
  submitted: boolean;
  agentId: bigint | null;
  implementationHash: string | null;
  agentIdInput: string;
  implementationHashInput: string;
  validationError: string | null;
}

export interface PassportResult {
  query: PassportQuery;
  passport: AgentPassport | null;
  error: string | null;
  errorKind: 'validation' | 'transport' | null;
}

export function parsePassportQuery(
  params: Record<string, string | string[] | undefined>,
): PassportQuery {
  const hasAgentId = params.agentId !== undefined;
  const hasVersionHash = params.versionHash !== undefined;
  const rawAgentId =
    typeof params.agentId === 'string' ? params.agentId.trim() : '';
  const rawHash =
    typeof params.versionHash === 'string' ? params.versionHash.trim() : '';
  const submitted = hasAgentId || hasVersionHash;
  const errors: string[] = [];

  if (!submitted) {
    return {
      submitted: false,
      agentId: null,
      implementationHash: null,
      agentIdInput: '',
      implementationHashInput: '',
      validationError: null,
    };
  }

  let agentId: bigint | null = null;
  try {
    agentId = parseAgentId(rawAgentId);
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
  }
  if (agentId === null)
    errors.push('Enter a positive ERC-8004 agent ID that fits in uint256.');

  let implementationHash: string | null = null;
  try {
    implementationHash = parseImplementationHash(rawHash);
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
  }
  if (implementationHash === null)
    errors.push('Enter a 32-byte implementation hash beginning with 0x.');

  return {
    submitted: true,
    agentId,
    implementationHash,
    agentIdInput: rawAgentId,
    implementationHashInput: rawHash,
    validationError: errors.length === 0 ? null : errors.join(' '),
  };
}

function timeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(
        () => reject(new Error('0G RPC request timed out')),
        milliseconds,
      );
    }),
  ]);
}

export async function loadPassport(
  query: PassportQuery,
): Promise<PassportResult> {
  if (!query.submitted) {
    return { query, passport: null, error: null, errorKind: null };
  }

  if (
    query.validationError !== null ||
    query.agentId === null ||
    query.implementationHash === null
  ) {
    return {
      query,
      passport: null,
      error: query.validationError ?? 'The agent lookup is invalid.',
      errorKind: 'validation',
    };
  }

  const client = new AgentSealClient({
    rpcUrl: process.env.OG_RPC_URL ?? OG_MAINNET.rpcUrl,
  });

  try {
    const passport = await timeout(
      client.verifyAgent({
        agentId: query.agentId,
        implementationHash: query.implementationHash,
      }),
      12_000,
    );
    return { query, passport, error: null, errorKind: null };
  } catch {
    return {
      query,
      passport: null,
      error:
        'The 0G RPC could not be reached. Verification failed closed; retry in a moment.',
      errorKind: 'transport',
    };
  }
}
