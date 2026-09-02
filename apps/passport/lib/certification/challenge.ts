import { OG_MAINNET } from '@agentseal/sdk';
import { verifyMessage } from 'ethers';

import { CertificationRequestError } from './errors';

export function createChallengeMessage(input: {
  requestId: string;
  agentId: string;
  implementationHash: string;
  packageUrl: string;
  ownerAddress: string;
  origin: string;
  expiresAt: number;
  nonce: string;
}): string {
  return [
    'AgentSeal Certification Request',
    '',
    `Origin: ${input.origin}`,
    `Chain: 0G Mainnet (${OG_MAINNET.chainId})`,
    `ERC-8004 Agent: ${input.agentId}`,
    `Implementation: ${input.implementationHash}`,
    `Assessment Package: ${input.packageUrl}`,
    `Owner: ${input.ownerAddress}`,
    `Request: ${input.requestId}`,
    `Nonce: ${input.nonce}`,
    `Expires: ${new Date(input.expiresAt).toISOString()}`,
    '',
    'Signing authorizes AgentSeal to assess this exact implementation and issue a 7-day seal only if every required policy check passes. This signature does not authorize asset transfers.',
  ].join('\n');
}

export function randomToken(bytes = 32): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function verifyOwnerSignature(
  message: string,
  signature: unknown,
  expectedOwner: string,
): void {
  if (
    typeof signature !== 'string' ||
    !/^0x[0-9a-fA-F]+$/.test(signature) ||
    signature.length > 1_000
  ) {
    throw new CertificationRequestError(
      'The ownership signature is invalid.',
      401,
      'invalid_signature',
    );
  }
  let recovered: string;
  try {
    recovered = verifyMessage(message, signature);
  } catch {
    throw new CertificationRequestError(
      'The ownership signature could not be verified.',
      401,
      'invalid_signature',
    );
  }
  if (recovered.toLowerCase() !== expectedOwner.toLowerCase()) {
    throw new CertificationRequestError(
      'Connect and sign with the current ERC-8004 owner wallet.',
      403,
      'owner_mismatch',
    );
  }
}
