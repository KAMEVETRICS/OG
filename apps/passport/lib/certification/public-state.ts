import { getCertification } from './database';
import { CertificationRequestError } from './errors';
import { CERTIFICATION_POLICY } from './policy';
import type { CertificationPublicState, CertificationRow } from './types';
import { parseAssessmentResults } from './types';

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
