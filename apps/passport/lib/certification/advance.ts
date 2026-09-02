import { OgComputeRouterClient } from '@agentseal/og-compute';

import {
  getAgentPackageVersion,
  getCertification,
  updateCertification,
  upsertAgentPackage,
} from './database';
import { certificationStorage, requiredEnv } from './env';
import { assertSameOwner, finalizeCertification } from './chain';
import { assessPolicyCase, buildAssessmentReport } from './assessment';
import { CERTIFICATION_POLICY } from './policy';
import type { AssessmentPackage, CertificationRow } from './types';
import { parseAssessmentResults } from './types';

const CASE_BUDGET_MS = 40_000;

async function ensureAgentPackageRegistration(row: CertificationRow): Promise<void> {
  const existing = await getAgentPackageVersion(row.agent_id, row.implementation_hash);
  let storageRoot = existing?.storage_root;
  let storageTransaction = existing?.storage_transaction;
  let storageDigest = existing?.storage_digest;
  if (!existing) {
    const receipt = await certificationStorage().putJson(JSON.parse(row.package_json) as unknown);
    storageRoot = receipt.rootHash;
    storageTransaction = receipt.transactionHash;
    storageDigest = receipt.contentDigest;
  }
  if (!storageRoot || !storageTransaction || !storageDigest) {
    throw new Error('Assessment package could not be committed to 0G Storage.');
  }
  const now = Date.now();
  await upsertAgentPackage({
    agent_id: row.agent_id,
    implementation_hash: row.implementation_hash,
    package_json: row.package_json,
    agent_name: row.agent_name,
    owner_address: row.owner_address,
    storage_root: storageRoot,
    storage_transaction: storageTransaction,
    storage_digest: storageDigest,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
}

async function advanceOneCase(row: CertificationRow, holder: string): Promise<void> {
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
}

export async function advanceCertification(
  row: CertificationRow,
  holder: string,
): Promise<void> {
  await assertSameOwner(row, holder);
  if (row.status === 'queued' || row.status === 'assessing') {
    let current = row;
    const deadline = Date.now() + CASE_BUDGET_MS;
    do {
      await assertSameOwner(current, holder);
      await advanceOneCase(current, holder);
      const next = await getCertification(current.id);
      if (!next) throw new Error('Certification request was not found.');
      current = next;
    } while (
      (current.status === 'queued' || current.status === 'assessing') &&
      Date.now() < deadline
    );
    return;
  }

  if (row.status === 'assessed' || row.status === 'uploading' || row.status === 'issuing') {
    await finalizeCertification(row, holder);
  }
}
