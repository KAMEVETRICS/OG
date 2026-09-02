import {
  agentPackagesOwnerIndexSchema,
  agentPackagesSchema,
  agentPackagesUpdatedIndexSchema,
  bumpQuotaSchema,
  certificationRequestsSchema,
  certifierLocksSchema,
  certifierQuotasSchema,
  createSignedCertificationSchema,
  ownerCreatedIndexSchema,
  statusUpdatedIndexSchema,
} from '@/db/schema';
import { CertificationRequestError } from './errors';
import { sqlExec, sqlFirst } from './sql';
import type {
  AgentPackageRow,
  CertificationRow,
  CertificationStatus,
} from './types';

export type CertificationPatch = Partial<
  Pick<
    CertificationRow,
    | 'status'
    | 'current_case'
    | 'results_json'
    | 'report_json'
    | 'safety_score'
    | 'passed_checks'
    | 'total_checks'
    | 'critical_failures'
    | 'evidence_root'
    | 'evidence_transaction'
    | 'evidence_digest'
    | 'seal_id'
    | 'seal_transaction'
    | 'seal_expires_at'
    | 'gate_admitted'
    | 'last_error'
    | 'updated_at'
  >
>;

const PATCH_COLUMNS: Record<keyof CertificationPatch, string> = {
  status: 'status',
  current_case: 'current_case',
  results_json: 'results_json',
  report_json: 'report_json',
  safety_score: 'safety_score',
  passed_checks: 'passed_checks',
  total_checks: 'total_checks',
  critical_failures: 'critical_failures',
  evidence_root: 'evidence_root',
  evidence_transaction: 'evidence_transaction',
  evidence_digest: 'evidence_digest',
  seal_id: 'seal_id',
  seal_transaction: 'seal_transaction',
  seal_expires_at: 'seal_expires_at',
  gate_admitted: 'gate_admitted',
  last_error: 'last_error',
  updated_at: 'updated_at',
};

let schemaReady: Promise<void> | null = null;

export async function ensureCertificationSchema(): Promise<void> {
  schemaReady ??= (async () => {
    for (const statement of [
      certificationRequestsSchema,
      ownerCreatedIndexSchema,
      statusUpdatedIndexSchema,
      certifierLocksSchema,
      agentPackagesSchema,
      agentPackagesUpdatedIndexSchema,
      agentPackagesOwnerIndexSchema,
      certifierQuotasSchema,
      bumpQuotaSchema,
      createSignedCertificationSchema,
      `INSERT INTO certifier_locks(name, holder, lease_until)
       VALUES ('issuer', NULL, 0)
       ON CONFLICT (name) DO NOTHING`,
      "DELETE FROM certification_requests WHERE status = 'awaiting_signature'",
    ]) {
      await sqlExec(statement);
    }
  })().catch((error: unknown) => {
    schemaReady = null;
    throw error;
  });
  await schemaReady;
}

export async function getLatestAgentPackage(
  agentId: string,
  owner: string,
): Promise<AgentPackageRow | null> {
  await ensureCertificationSchema();
  return sqlFirst<AgentPackageRow>(
    `
      SELECT * FROM agent_packages
      WHERE agent_id = $1 AND owner_address = $2
      ORDER BY updated_at DESC LIMIT 1
    `,
    [agentId, owner.toLowerCase()],
  );
}

export async function getAgentPackageVersion(
  agentId: string,
  implementationHash: string,
): Promise<AgentPackageRow | null> {
  await ensureCertificationSchema();
  return sqlFirst<AgentPackageRow>(
    'SELECT * FROM agent_packages WHERE agent_id = $1 AND implementation_hash = $2',
    [agentId, implementationHash.toLowerCase()],
  );
}

export async function upsertAgentPackage(row: AgentPackageRow): Promise<void> {
  await ensureCertificationSchema();
  await sqlExec(
    `
      INSERT INTO agent_packages (
        agent_id, implementation_hash, package_json, agent_name, owner_address,
        storage_root, storage_transaction, storage_digest, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (agent_id, implementation_hash) DO UPDATE SET
        package_json = EXCLUDED.package_json,
        agent_name = EXCLUDED.agent_name,
        owner_address = EXCLUDED.owner_address,
        storage_root = EXCLUDED.storage_root,
        storage_transaction = EXCLUDED.storage_transaction,
        storage_digest = EXCLUDED.storage_digest,
        updated_at = EXCLUDED.updated_at
    `,
    [
      row.agent_id,
      row.implementation_hash.toLowerCase(),
      row.package_json,
      row.agent_name,
      row.owner_address.toLowerCase(),
      row.storage_root,
      row.storage_transaction,
      row.storage_digest,
      row.created_at,
      row.updated_at,
    ],
  );
}

export async function getCertification(id: string): Promise<CertificationRow | null> {
  await ensureCertificationSchema();
  return sqlFirst<CertificationRow>(
    'SELECT * FROM certification_requests WHERE id = $1',
    [id],
  );
}

export async function createSignedCertification(input: {
  id: string;
  agentId: string;
  implementationHash: string;
  packageUrl: string;
  packageJson: string;
  agentName: string;
  owner: string;
  challengeMessage: string;
  expiresAt: number;
  resumeTokenHash: string;
  now: number;
  ownerLimit: number;
  globalLimit: number;
}): Promise<void> {
  await ensureCertificationSchema();
  const day = new Date(input.now).toISOString().slice(0, 10);
  try {
    const row = await sqlFirst<{ create_signed_certification: string }>(
      'SELECT create_signed_certification($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
      [
        input.id,
        input.agentId,
        input.implementationHash,
        input.packageUrl,
        input.packageJson,
        input.agentName,
        input.owner.toLowerCase(),
        input.challengeMessage,
        input.expiresAt,
        input.resumeTokenHash,
        input.now,
        day,
        input.ownerLimit,
        input.globalLimit,
      ],
    );
    if (!row?.create_signed_certification) {
      throw new CertificationRequestError(
        'This ownership challenge was already used.',
        409,
        'challenge_consumed',
      );
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('owner_rate_limit')) {
      throw new CertificationRequestError(
        'This owner has reached the daily certification limit.',
        429,
        'owner_rate_limit',
      );
    }
    if (message.includes('global_rate_limit')) {
      throw new CertificationRequestError(
        'Daily certification capacity is full. Try again tomorrow.',
        429,
        'global_rate_limit',
      );
    }
    if (message.includes('challenge_consumed')) {
      throw new CertificationRequestError(
        'This ownership challenge was already used.',
        409,
        'challenge_consumed',
      );
    }
    if (message.includes('challenge_expired')) {
      throw new CertificationRequestError(
        'This ownership challenge has expired. Start a new request.',
        409,
        'challenge_expired',
      );
    }
    throw error;
  }
}

export async function claimCertification(
  id: string,
  holder: string,
  now: number,
): Promise<boolean> {
  const result = await sqlExec(
    `
      UPDATE certification_requests
      SET processing_token = $1, processing_until = $2, updated_at = $3
      WHERE id = $4 AND status NOT IN ('sealed', 'rejected', 'failed')
        AND (processing_until IS NULL OR processing_until < $3)
      RETURNING id
    `,
    [holder, now + 300_000, now, id],
  );
  return result.changes === 1;
}

export async function releaseCertification(id: string, holder: string): Promise<void> {
  await sqlExec(
    `
      UPDATE certification_requests
      SET processing_token = NULL, processing_until = NULL
      WHERE id = $1 AND processing_token = $2
    `,
    [id, holder],
  );
}

export async function updateCertification(
  id: string,
  holder: string,
  patch: CertificationPatch,
): Promise<void> {
  const entries = (Object.keys(PATCH_COLUMNS) as Array<keyof CertificationPatch>)
    .map((key) => [key, patch[key]] as const)
    .filter((entry): entry is readonly [keyof CertificationPatch, NonNullable<CertificationPatch[keyof CertificationPatch]>] =>
      entry[1] !== undefined,
    );
  if (entries.length === 0) throw new Error('Invalid certification update');
  const assignments = entries
    .map(([key], index) => `${PATCH_COLUMNS[key]} = $${index + 1}`)
    .join(', ');
  const result = await sqlExec(
    `UPDATE certification_requests SET ${assignments} WHERE id = $${entries.length + 1} AND processing_token = $${entries.length + 2} RETURNING id`,
    [...entries.map(([, value]) => value), id, holder],
  );
  if (result.changes !== 1) {
    throw new Error('Certification update lost its processing lease');
  }
}

export async function setCertificationError(
  id: string,
  holder: string,
  message: string,
  now: number,
): Promise<void> {
  await updateCertification(id, holder, {
    last_error: message.slice(0, 300),
    updated_at: now,
  });
}

export async function acquireIssuerLock(holder: string, now: number): Promise<boolean> {
  const result = await sqlExec(
    `
      UPDATE certifier_locks SET holder = $1, lease_until = $2
      WHERE name = 'issuer' AND (holder IS NULL OR lease_until < $3)
      RETURNING name
    `,
    [holder, now + 600_000, now],
  );
  return result.changes === 1;
}

export async function releaseIssuerLock(holder: string): Promise<void> {
  await sqlExec(
    'UPDATE certifier_locks SET holder = NULL, lease_until = 0 WHERE name = $1 AND holder = $2',
    ['issuer', holder],
  );
}

export function isTerminalStatus(status: CertificationStatus): boolean {
  return status === 'sealed' || status === 'rejected';
}
