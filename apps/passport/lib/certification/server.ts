import { parseImplementationHash } from '@/lib/api/input';
import { OG_MAINNET } from '@agentseal/sdk';
import { verifyMessage } from 'ethers';

import { getCertification } from './database';
import { fetchAssessmentPackage } from './assessment';
import { certificationModelRevision } from './env';
import { CertificationRequestError } from './errors';
import { CERTIFICATION_POLICY } from './policy';
import type { AssessmentReport } from '@agentseal/core/types';
import type { AssessmentPackage, CertificationPublicState, CertificationRow } from './types';
import { parseAssessmentReport, parseAssessmentResults } from './types';

export { CertificationRequestError } from './errors';
export { CertificationStorageError } from './errors';
export {
  certificationModelRevision,
  certificationStorage,
  certifierLimits,
  certifierProvider,
} from './env';
export { getAgentOwner } from './chain';
export { advanceCertification } from './advance';
export { CERTIFICATION_POLICY } from './policy';

export function normalizeImplementationHash(value: unknown): string {
  try {
    return parseImplementationHash(value);
  } catch {
    throw new CertificationRequestError(
      'Enter a 32-byte implementation hash beginning with 0x.',
    );
  }
}

export function normalizePackageUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 1_000) {
    throw new CertificationRequestError(
      'Enter the HTTPS URL of an AgentSeal assessment package.',
    );
  }
  return value.trim();
}

export async function loadSubmittedPackage(
  packageUrl: string,
  implementationHash: string,
): Promise<AssessmentPackage> {
  try {
    return await fetchAssessmentPackage(
      packageUrl,
      implementationHash,
      certificationModelRevision(),
    );
  } catch (error) {
    throw new CertificationRequestError(
      error instanceof Error ? error.message : 'Assessment package validation failed',
      422,
      'invalid_package',
    );
  }
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

export function toPublicState(row: CertificationRow): CertificationPublicState {
  const results = parseAssessmentResults(row);
  const completedRuns = results.reduce((sum, result) => sum + result.runs.length, 0);
  return {
    id: row.id,
    status: row.status,
    agentId: row.agent_id,
    implementationHash: row.implementation_hash,
    packageUrl: row.package_url,
    agentName: row.agent_name,
    ownerAddress: row.owner_address,
    currentCase: row.current_case,
    totalCases: CERTIFICATION_POLICY.cases.length,
    completedRuns,
    totalRuns: CERTIFICATION_POLICY.cases.length * CERTIFICATION_POLICY.runsPerCase,
    safetyScore: row.safety_score,
    passedChecks: row.passed_checks,
    totalChecks: row.total_checks,
    criticalFailures: row.critical_failures,
    evidenceRoot: row.evidence_root,
    evidenceTransaction: row.evidence_transaction,
    sealId: row.seal_id,
    sealTransaction: row.seal_transaction,
    sealExpiresAt: row.seal_expires_at ? new Date(row.seal_expires_at).toISOString() : null,
    gateAdmitted: row.gate_admitted === null ? null : row.gate_admitted === 1,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function refreshedPublicState(id: string): Promise<CertificationPublicState> {
  const row = await getCertification(id);
  if (!row) {
    throw new CertificationRequestError(
      'Certification request was not found.',
      404,
      'not_found',
    );
  }
  return toPublicState(row);
}

export function reportForRow(row: CertificationRow): AssessmentReport | null {
  return parseAssessmentReport(row);
}
