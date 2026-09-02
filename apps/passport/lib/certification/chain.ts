import { Contract, Wallet, ZeroAddress, getAddress, isAddress } from 'ethers';
import { OG_MAINNET } from '@agentseal/sdk';

import { parseAgentId } from '@/lib/api/input';
import {
  acquireIssuerLock,
  releaseIssuerLock,
  updateCertification,
} from './database';
import { certificationStorage, certifierProvider, issuerPrivateKey, requiredEnv } from './env';
import { CertificationRequestError } from './errors';
import { CERTIFICATION_POLICY } from './policy';
import type { CertificationRow } from './types';
import { parseAssessmentReport } from './types';

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

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export async function getAgentOwner(agentId: string): Promise<string> {
  parseAgentId(agentId);
  const registryAddress = requiredEnv('ERC8004_IDENTITY_REGISTRY');
  if (!isAddress(registryAddress)) {
    throw new CertificationRequestError(
      'The identity registry is misconfigured.',
      503,
      'service_unavailable',
    );
  }
  try {
    const identity = new Contract(registryAddress, IDENTITY_ABI, certifierProvider());
    return getAddress((await identity.ownerOf(BigInt(agentId))) as string);
  } catch {
    throw new CertificationRequestError(
      'No ERC-8004 identity was found for this agent ID.',
      404,
      'identity_not_found',
    );
  }
}

export async function assertSameOwner(
  row: CertificationRow,
  holder?: string,
): Promise<void> {
  const currentOwner = await getAgentOwner(row.agent_id);
  if (currentOwner.toLowerCase() === row.owner_address.toLowerCase()) return;
  if (holder) {
    await updateCertification(row.id, holder, {
      status: 'rejected',
      last_error: 'ERC-8004 ownership changed. Certification cannot continue.',
      updated_at: Date.now(),
    });
  }
  throw new CertificationRequestError(
    'ERC-8004 ownership changed. Certification cannot continue.',
    409,
    'ownership_changed',
  );
}

export async function finalizeCertification(
  row: CertificationRow,
  holder: string,
): Promise<void> {
  await assertSameOwner(row, holder);
  const report = parseAssessmentReport(row);
  if (!report?.certifiable) {
    throw new CertificationRequestError(
      'Only a passing assessment can be sealed.',
      409,
      'not_certifiable',
    );
  }
  const issuerHolder = `${row.id}:${holder}`;
  const acquired = await acquireIssuerLock(issuerHolder, Date.now());
  if (!acquired) {
    throw new CertificationRequestError(
      'Another seal is being finalized. Retry in a moment.',
      409,
      'issuer_busy',
    );
  }

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
      const receipt = await certificationStorage().put(report);
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
    const signer = new Wallet(issuerPrivateKey(), provider);
    const registry = new Contract(OG_MAINNET.agentSealRegistry, REGISTRY_ABI, signer);
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
    let sealExpiresAtSeconds: bigint;

    if (validationStatus === 0n && sealId !== 0n) {
      const existing = (await registry.seals(sealId)) as { expiresAt: bigint };
      sealExpiresAtSeconds = existing.expiresAt;
    } else {
      sealExpiresAtSeconds = BigInt(Math.floor(Date.now() / 1_000) + SEVEN_DAYS_SECONDS);
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
        expiresAt: sealExpiresAtSeconds,
        issuer: ZeroAddress,
        revoked: false,
      });
      const receipt = await transaction.wait();
      if (!receipt || receipt.status !== 1) throw new Error('Seal issuance transaction failed');
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
      throw new Error('The issued seal did not pass final AgentGate verification');
    }
    await updateCertification(row.id, holder, {
      status: 'sealed',
      seal_id: sealId.toString(),
      seal_transaction: sealTransaction,
      seal_expires_at: Number(sealExpiresAtSeconds) * 1_000,
      gate_admitted: 1,
      last_error: null,
      updated_at: Date.now(),
    });
  } finally {
    await releaseIssuerLock(issuerHolder);
  }
}
