import { timingSafeEqual } from 'node:crypto';
import { OG_MAINNET } from '@agentseal/sdk';
import { verifyMessage } from 'ethers';

import { CertificationRequestError } from './errors.ts';

export const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE_PATTERN = /^[0-9a-f]{32}$/;

export function parseRequestId(value: unknown): string {
  if (typeof value !== 'string' || !REQUEST_ID_PATTERN.test(value.trim())) {
    throw new CertificationRequestError('Certification request ID is invalid.');
  }
  return value.trim();
}

export function parseChallengeNonce(value: unknown): string {
  if (typeof value !== 'string' || !NONCE_PATTERN.test(value)) {
    throw new CertificationRequestError('Certification challenge nonce is invalid.');
  }
  return value;
}

export function parseChallengeExpiry(value: unknown, now: number): number {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new CertificationRequestError('Certification challenge expiry is invalid.');
  }
  const expiresAt = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(expiresAt)) {
    throw new CertificationRequestError('Certification challenge expiry is invalid.');
  }
  if (expiresAt <= now || expiresAt > now + CHALLENGE_TTL_MS) {
    throw new CertificationRequestError(
      'This ownership challenge has expired. Start a new request.',
      409,
      'challenge_expired',
    );
  }
  return expiresAt;
}

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

export function tokenHashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
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
