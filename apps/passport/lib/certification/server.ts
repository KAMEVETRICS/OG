import {
  Contract,
  JsonRpcProvider,
  Wallet,
  ZeroAddress,
  getAddress,
  isAddress,
  verifyMessage,
} from 'ethers';

import policyJson from '../../../../benchmarks/defi-safe/v1/policy.json';
import type {
  AssessmentReport,
  CertificationPolicy,
} from '../../../../packages/core/src/types.ts';
import { OgComputeRouterClient } from '../../../../packages/og-compute/src/router-client.ts';
import { OgStorageEvidenceStore } from '../../../../packages/og-storage/src/evidence-store.ts';
import { OG_MAINNET } from '@agentseal/sdk';
import { parseAgentId, parseImplementationHash } from '@/lib/api/input';
import {
  acquireIssuerLock,
  getAgentPackageVersion,
  getCertification,
  releaseIssuerLock,
  upsertAgentPackage,
  updateCertification,
} from './database';
import {
  assessPolicyCase,
  buildAssessmentReport,
  fetchAssessmentPackage,
} from './assessment';
import type {
  AssessmentPackage,
  CertificationPublicState,
  CertificationRow,
} from './types';
import { parseAssessmentReport, parseAssessmentResults } from './types';

const IDENTITY_ABI = [
  'function ownerOf(uint256 agentId) external view returns (address)',
] as const;
const REGISTRY_ABI = [
  'function isIssuer(address issuer) external view returns (bool)',
  'function issueSeal((uint256 agentId, bytes32 versionHash, bytes32 policyHash, bytes32 evidenceRoot, uint16 safetyScore, uint16 passedChecks, uint16 totalChecks, uint16 criticalFailures, uint64 issuedAt, uint64 expiresAt, address issuer, bool revoked) candidate) external returns (uint256 sealId)',
  'function validateSeal(uint256 agentId, bytes32 versionHash, bytes32 policyHash, uint16 minimumScore, address trustedIssuer) external view returns (uint8 status, uint256 sealId)',
  'function seals(uint256 sealId) external view returns (uint256 agentId, bytes32 versionHash, bytes32 policyHash, bytes32 evidenceRoot, uint16 safetyScore, uint16 passedChecks, uint16 totalChecks, uint16 criticalFailures, uint64 issuedAt, uint64 expiresAt, address issuer, bool revoked)',
] as const;
const GATE_ABI = [
  'function canExecute(uint256 agentId, bytes32 versionHash) external view returns (bool)',
] as const;

export const CERTIFICATION_POLICY = policyJson as CertificationPolicy;

export class CertificationRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status = 400, code = 'invalid_request') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value)
    throw new CertificationRequestError(
      'The certification service is not fully configured.',
      503,
      'service_unavailable',
    );
  return value;
}

function privateKey(): string {
  const configured = requiredEnv('OG_PRIVATE_KEY');
  const normalized = configured.startsWith('0x')
    ? configured
    : `0x${configured}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new CertificationRequestError(
      'The certification signer is misconfigured.',
      503,
      'service_unavailable',
    );
  }
  return normalized;
}

export function certificationModelRevision(): string {
  return requiredEnv('OG_COMPUTE_MODEL');
}

export function certificationStorage(): OgStorageEvidenceStore {
  return new OgStorageEvidenceStore({
    rpcUrl: requiredEnv('OG_RPC_URL'),
    indexerUrl: requiredEnv('OG_STORAGE_INDEXER_RPC'),
    privateKey: privateKey(),
  });
}

export function certifierLimits() {
  const owner = Number(process.env.CERTIFIER_DAILY_OWNER_LIMIT ?? '2');
  const global = Number(process.env.CERTIFIER_DAILY_GLOBAL_LIMIT ?? '20');
  return {
    owner: Number.isInteger(owner) && owner > 0 ? owner : 2,
    global: Number.isInteger(global) && global > 0 ? global : 20,
  };
}

export function certifierProvider(): JsonRpcProvider {
  return new JsonRpcProvider(requiredEnv('OG_RPC_URL'));
}

export async function getAgentOwner(agentId: string): Promise<string> {
  parseAgentId(agentId);
  const registryAddress = requiredEnv('ERC8004_IDENTITY_REGISTRY');
  if (!isAddress(registryAddress))
    throw new CertificationRequestError(
      'The identity registry is misconfigured.',
      503,
      'service_unavailable',
    );
  try {
    const identity = new Contract(
      registryAddress,
      IDENTITY_ABI,
      certifierProvider(),
    );
    return getAddress((await identity.ownerOf(BigInt(agentId))) as string);
  } catch {
    throw new CertificationRequestError(
      'No ERC-8004 identity was found for this agent ID.',
      404,
      'identity_not_found',
    );
  }
}

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
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > 1_000
  ) {
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
  const modelRevision = certificationModelRevision();
  try {
    return await fetchAssessmentPackage(
      packageUrl,
      implementationHash,
      modelRevision,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Assessment package validation failed';
    throw new CertificationRequestError(message, 422, 'invalid_package');
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
  return Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export async function tokenHash(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
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
  const completedRuns = results.reduce(
    (sum, result) => sum + result.runs.length,
    0,
  );
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
    totalRuns:
      CERTIFICATION_POLICY.cases.length * CERTIFICATION_POLICY.runsPerCase,
    safetyScore: row.safety_score,
    passedChecks: row.passed_checks,
    totalChecks: row.total_checks,
    criticalFailures: row.critical_failures,
    evidenceRoot: row.evidence_root,
    evidenceTransaction: row.evidence_transaction,
    sealId: row.seal_id,
    sealTransaction: row.seal_transaction,
    sealExpiresAt: row.seal_expires_at
      ? new Date(row.seal_expires_at * 1_000).toISOString()
      : null,
    gateAdmitted: row.gate_admitted === null ? null : row.gate_admitted === 1,
    lastError: row.last_error,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function finalizeCertification(
  row: CertificationRow,
  holder: string,
): Promise<void> {
  const report = parseAssessmentReport(row);
  if (!report?.certifiable)
    throw new CertificationRequestError(
      'Only a passing assessment can be sealed.',
      409,
      'not_certifiable',
    );
  const issuerHolder = `${row.id}:${holder}`;
  const acquired = await acquireIssuerLock(issuerHolder, Date.now());
  if (!acquired)
    throw new CertificationRequestError(
      'Another seal is being finalized. Retry in a moment.',
      409,
      'issuer_busy',
    );

  try {
    let evidenceRoot = row.evidence_root;
    let evidenceTransaction = row.evidence_transaction;
    let evidenceDigest = row.evidence_digest;
    if (!evidenceRoot || !evidenceTransaction || !evidenceDigest) {
      await updateCertification(row.id, holder, {
        status: 'uploading',
        updated_at: Date.now(),
        last_error: null,
      });
      const evidenceStore = certificationStorage();
      const receipt = await evidenceStore.put(report);
      evidenceRoot = receipt.rootHash;
      evidenceTransaction = receipt.transactionHash;
      evidenceDigest = receipt.contentDigest;
      await updateCertification(row.id, holder, {
        status: 'issuing',
        evidence_root: evidenceRoot,
        evidence_transaction: evidenceTransaction,
        evidence_digest: evidenceDigest,
        updated_at: Date.now(),
      });
    }

    const provider = certifierProvider();
    const signer = new Wallet(privateKey(), provider);
    const registry = new Contract(
      OG_MAINNET.agentSealRegistry,
      REGISTRY_ABI,
      signer,
    );
    const gate = new Contract(OG_MAINNET.agentGate, GATE_ABI, provider);
    if (!((await registry.isIssuer(signer.address)) as boolean)) {
      throw new CertificationRequestError(
        'The configured signer is not an authorized issuer.',
        503,
        'issuer_unavailable',
      );
    }

    let [validationStatus, sealId] = (await registry.validateSeal(
      BigInt(report.agentId),
      report.implementationHash,
      report.policyHash,
      CERTIFICATION_POLICY.minimumScore,
      signer.address,
    )) as [bigint, bigint];
    let sealTransaction: string | null = row.seal_transaction;
    let sealExpiresAt: bigint;

    if (validationStatus === 0n && sealId !== 0n) {
      const existing = (await registry.seals(sealId)) as { expiresAt: bigint };
      sealExpiresAt = existing.expiresAt;
    } else {
      sealExpiresAt = BigInt(Math.floor(Date.now() / 1_000) + 7 * 24 * 60 * 60);
      const transaction = await registry.issueSeal({
        agentId: BigInt(report.agentId),
        versionHash: report.implementationHash,
        policyHash: report.policyHash,
        evidenceRoot,
        safetyScore: report.safetyScore,
        passedChecks: report.passedChecks,
        totalChecks: report.totalChecks,
        criticalFailures: report.criticalFailures,
        issuedAt: 0,
        expiresAt: sealExpiresAt,
        issuer: ZeroAddress,
        revoked: false,
      });
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1)
        throw new Error('Seal issuance transaction failed');
      sealTransaction = receipt.hash;
      [validationStatus, sealId] = (await registry.validateSeal(
        BigInt(report.agentId),
        report.implementationHash,
        report.policyHash,
        CERTIFICATION_POLICY.minimumScore,
        signer.address,
      )) as [bigint, bigint];
    }

    const admitted = (await gate.canExecute(
      BigInt(report.agentId),
      report.implementationHash,
    )) as boolean;
    if (validationStatus !== 0n || sealId === 0n || !admitted) {
      throw new Error(
        'The issued seal did not pass final AgentGate verification',
      );
    }
    await updateCertification(row.id, holder, {
      status: 'sealed',
      seal_id: sealId.toString(),
      seal_transaction: sealTransaction,
      seal_expires_at: Number(sealExpiresAt),
      gate_admitted: 1,
      last_error: null,
      updated_at: Date.now(),
    });
  } finally {
    await releaseIssuerLock(issuerHolder);
  }
}

async function ensureAgentPackageRegistration(
  row: CertificationRow,
): Promise<void> {
  const existing = await getAgentPackageVersion(
    row.agent_id,
    row.implementation_hash,
  );
  let storageRoot = existing?.storage_root;
  let storageTransaction = existing?.storage_transaction;
  let storageDigest = existing?.storage_digest;
  if (!existing) {
    const receipt = await certificationStorage().putJson(
      JSON.parse(row.package_json) as unknown,
    );
    storageRoot = receipt.rootHash;
    storageTransaction = receipt.transactionHash;
    storageDigest = receipt.contentDigest;
  }
  const now = Date.now();
  await upsertAgentPackage({
    agent_id: row.agent_id,
    implementation_hash: row.implementation_hash,
    package_json: row.package_json,
    agent_name: row.agent_name,
    owner_address: row.owner_address,
    storage_root: storageRoot!,
    storage_transaction: storageTransaction!,
    storage_digest: storageDigest!,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
}

export async function advanceCertification(
  row: CertificationRow,
  holder: string,
): Promise<void> {
  if (row.status === 'queued' || row.status === 'assessing') {
    if (row.status === 'queued') await ensureAgentPackageRegistration(row);
    const currentCase = CERTIFICATION_POLICY.cases[row.current_case];
    if (!currentCase) throw new Error('Assessment case index is out of range');
    const assessmentPackage = JSON.parse(row.package_json) as AssessmentPackage;
    const client = new OgComputeRouterClient({
      apiKey: requiredEnv('OG_COMPUTE_API_KEY'),
      baseUrl: requiredEnv('OG_COMPUTE_BASE_URL'),
      model: requiredEnv('OG_COMPUTE_MODEL'),
    });
    const result = await assessPolicyCase(
      client,
      assessmentPackage,
      CERTIFICATION_POLICY,
      currentCase,
    );
    const results = [...parseAssessmentResults(row), result];
    const nextCase = row.current_case + 1;
    if (nextCase < CERTIFICATION_POLICY.cases.length) {
      await updateCertification(row.id, holder, {
        status: 'assessing',
        current_case: nextCase,
        results_json: JSON.stringify(results),
        last_error: null,
        updated_at: Date.now(),
      });
      return;
    }

    const report = buildAssessmentReport({
      agentId: row.agent_id,
      assessmentPackage,
      policy: CERTIFICATION_POLICY,
      results,
      startedAt: new Date(row.created_at).toISOString(),
      completedAt: new Date().toISOString(),
    });
    await updateCertification(row.id, holder, {
      status: report.certifiable ? 'assessed' : 'rejected',
      current_case: nextCase,
      results_json: JSON.stringify(results),
      report_json: JSON.stringify(report),
      safety_score: report.safetyScore,
      passed_checks: report.passedChecks,
      total_checks: report.totalChecks,
      critical_failures: report.criticalFailures,
      last_error: null,
      updated_at: Date.now(),
    });
    return;
  }

  if (
    row.status === 'assessed' ||
    row.status === 'uploading' ||
    row.status === 'issuing'
  ) {
    await finalizeCertification(row, holder);
  }
}

export async function refreshedPublicState(
  id: string,
): Promise<CertificationPublicState> {
  const row = await getCertification(id);
  if (!row)
    throw new CertificationRequestError(
      'Certification request was not found.',
      404,
      'not_found',
    );
  return toPublicState(row);
}

export function reportForRow(row: CertificationRow): AssessmentReport | null {
  return parseAssessmentReport(row);
}
