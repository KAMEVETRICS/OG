import type {
  AssessmentCaseResult,
  AssessmentReport,
  ImplementationManifest,
} from '@agentseal/core/types';

export const CERTIFICATION_STATUSES = [
  'awaiting_signature',
  'queued',
  'assessing',
  'rejected',
  'assessed',
  'uploading',
  'issuing',
  'sealed',
  'failed',
] as const;

export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export interface AssessmentPackage {
  schemaVersion: '1.0';
  manifest: ImplementationManifest;
  systemPrompt: string;
  toolSchema: Array<'swap' | 'approve' | 'transfer' | 'read'>;
}

export interface AgentPackageRow {
  agent_id: string;
  implementation_hash: string;
  package_json: string;
  agent_name: string;
  owner_address: string;
  storage_root: string;
  storage_transaction: string;
  storage_digest: string;
  created_at: number;
  updated_at: number;
}

export interface CurrentSeal {
  sealId: string;
  implementationHash: string;
  expiresAt: string;
  safetyScore: number;
  gateAdmitted: boolean;
}

export interface OwnedAgent {
  agentId: string;
  name: string;
  description: string | null;
  active: boolean;
  packageReady: boolean;
  implementationHash: string | null;
  packageSource: 'registered' | 'agentseal' | null;
  currentSeal: CurrentSeal | null;
}

export interface CertificationRow {
  id: string;
  agent_id: string;
  implementation_hash: string;
  package_url: string;
  package_json: string;
  agent_name: string;
  owner_address: string;
  challenge_message: string;
  challenge_expires_at: number; // epoch milliseconds
  resume_token_hash: string | null;
  status: CertificationStatus;
  current_case: number;
  results_json: string;
  report_json: string | null;
  safety_score: number | null;
  passed_checks: number | null;
  total_checks: number | null;
  critical_failures: number | null;
  evidence_root: string | null;
  evidence_transaction: string | null;
  evidence_digest: string | null;
  seal_id: string | null;
  seal_transaction: string | null;
  seal_expires_at: number | null; // epoch milliseconds
  gate_admitted: number | null;
  processing_token: string | null;
  processing_until: number | null; // epoch milliseconds
  last_error: string | null;
  created_at: number; // epoch milliseconds
  updated_at: number; // epoch milliseconds
}

export interface CertificationPublicState {
  id: string;
  status: CertificationStatus;
  agentId: string;
  implementationHash: string;
  packageUrl: string;
  agentName: string;
  ownerAddress: string;
  currentCase: number;
  totalCases: number;
  completedRuns: number;
  totalRuns: number;
  safetyScore: number | null;
  passedChecks: number | null;
  totalChecks: number | null;
  criticalFailures: number | null;
  evidenceRoot: string | null;
  evidenceTransaction: string | null;
  sealId: string | null;
  sealTransaction: string | null;
  sealExpiresAt: string | null;
  gateAdmitted: boolean | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export function parseAssessmentResults(
  row: CertificationRow,
): AssessmentCaseResult[] {
  return JSON.parse(row.results_json) as AssessmentCaseResult[];
}

export function parseAssessmentReport(
  row: CertificationRow,
): AssessmentReport | null {
  return row.report_json
    ? (JSON.parse(row.report_json) as AssessmentReport)
    : null;
}
