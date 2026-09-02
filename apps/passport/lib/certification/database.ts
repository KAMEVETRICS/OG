import { env } from 'cloudflare:workers';

import {
  agentPackagesOwnerIndexSchema,
  agentPackagesSchema,
  agentPackagesUpdatedIndexSchema,
  certificationRequestsSchema,
  certifierLocksSchema,
  ownerCreatedIndexSchema,
  statusUpdatedIndexSchema,
} from '@/db/schema';
import type {
  AgentPackageRow,
  CertificationRow,
  CertificationStatus,
} from './types';

let schemaReady: Promise<void> | null = null;

export function certificationDatabase(): D1Database {
  if (!env.DB) throw new Error('Certification database binding is unavailable');
  return env.DB;
}

export async function ensureCertificationSchema(): Promise<void> {
  schemaReady ??= (async () => {
    const database = certificationDatabase();
    await database.batch([
      database.prepare(certificationRequestsSchema),
      database.prepare(ownerCreatedIndexSchema),
      database.prepare(statusUpdatedIndexSchema),
      database.prepare(certifierLocksSchema),
      database.prepare(agentPackagesSchema),
      database.prepare(agentPackagesUpdatedIndexSchema),
      database.prepare(agentPackagesOwnerIndexSchema),
      database.prepare(
        "INSERT OR IGNORE INTO certifier_locks(name, holder, lease_until) VALUES ('issuer', NULL, 0)",
      ),
    ]);
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
  return certificationDatabase()
    .prepare(`
      SELECT * FROM agent_packages
      WHERE agent_id = ?1 AND owner_address = ?2
      ORDER BY updated_at DESC LIMIT 1
    `)
    .bind(agentId, owner.toLowerCase())
    .first<AgentPackageRow>();
}

export async function getAgentPackageVersion(
  agentId: string,
  implementationHash: string,
): Promise<AgentPackageRow | null> {
  await ensureCertificationSchema();
  return certificationDatabase()
    .prepare(
      'SELECT * FROM agent_packages WHERE agent_id = ?1 AND implementation_hash = ?2',
    )
    .bind(agentId, implementationHash.toLowerCase())
    .first<AgentPackageRow>();
}

export async function upsertAgentPackage(row: AgentPackageRow): Promise<void> {
  await ensureCertificationSchema();
  await certificationDatabase()
    .prepare(`
      INSERT INTO agent_packages (
        agent_id, implementation_hash, package_json, agent_name, owner_address,
        storage_root, storage_transaction, storage_digest, created_at, updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(agent_id, implementation_hash) DO UPDATE SET
        package_json = excluded.package_json,
        agent_name = excluded.agent_name,
        owner_address = excluded.owner_address,
        storage_root = excluded.storage_root,
        storage_transaction = excluded.storage_transaction,
        storage_digest = excluded.storage_digest,
        updated_at = excluded.updated_at
    `)
    .bind(
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
    )
    .run();
}

export async function getCertification(
  id: string,
): Promise<CertificationRow | null> {
  await ensureCertificationSchema();
  return certificationDatabase()
    .prepare('SELECT * FROM certification_requests WHERE id = ?1')
    .bind(id)
    .first<CertificationRow>();
}

export async function countRecentCertifications(
  owner: string,
  since: number,
): Promise<number> {
  await ensureCertificationSchema();
  const row = await certificationDatabase()
    .prepare(
      "SELECT COUNT(*) AS count FROM certification_requests WHERE owner_address = ?1 AND created_at >= ?2 AND status != 'awaiting_signature'",
    )
    .bind(owner.toLowerCase(), since)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function countGlobalCertifications(
  since: number,
): Promise<number> {
  await ensureCertificationSchema();
  const row = await certificationDatabase()
    .prepare(
      "SELECT COUNT(*) AS count FROM certification_requests WHERE created_at >= ?1 AND status != 'awaiting_signature'",
    )
    .bind(since)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function deleteExpiredChallenges(now: number): Promise<void> {
  await ensureCertificationSchema();
  await certificationDatabase()
    .prepare(
      "DELETE FROM certification_requests WHERE status = 'awaiting_signature' AND challenge_expires_at <= ?1",
    )
    .bind(now)
    .run();
}

export async function insertCertification(
  row: CertificationRow,
): Promise<void> {
  await ensureCertificationSchema();
  await certificationDatabase()
    .prepare(`
      INSERT INTO certification_requests (
        id, agent_id, implementation_hash, package_url, package_json, agent_name,
        owner_address, challenge_message, challenge_expires_at, resume_token_hash,
        status, current_case, results_json, report_json, safety_score, passed_checks,
        total_checks, critical_failures, evidence_root, evidence_transaction,
        evidence_digest, seal_id, seal_transaction, seal_expires_at, gate_admitted,
        processing_token, processing_until, last_error, created_at, updated_at
      ) VALUES (
        ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
        ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
        ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30
      )
    `)
    .bind(
      row.id,
      row.agent_id,
      row.implementation_hash,
      row.package_url,
      row.package_json,
      row.agent_name,
      row.owner_address,
      row.challenge_message,
      row.challenge_expires_at,
      row.resume_token_hash,
      row.status,
      row.current_case,
      row.results_json,
      row.report_json,
      row.safety_score,
      row.passed_checks,
      row.total_checks,
      row.critical_failures,
      row.evidence_root,
      row.evidence_transaction,
      row.evidence_digest,
      row.seal_id,
      row.seal_transaction,
      row.seal_expires_at,
      row.gate_admitted,
      row.processing_token,
      row.processing_until,
      row.last_error,
      row.created_at,
      row.updated_at,
    )
    .run();
}

export async function consumeChallenge(
  id: string,
  resumeTokenHash: string,
  now: number,
): Promise<boolean> {
  const result = await certificationDatabase()
    .prepare(`
      UPDATE certification_requests
      SET status = 'queued', resume_token_hash = ?1, updated_at = ?2, last_error = NULL
      WHERE id = ?3 AND status = 'awaiting_signature' AND challenge_expires_at > ?2
    `)
    .bind(resumeTokenHash, now, id)
    .run();
  return Number(result.meta.changes) === 1;
}

export async function claimCertification(
  id: string,
  holder: string,
  now: number,
): Promise<boolean> {
  const result = await certificationDatabase()
    .prepare(`
      UPDATE certification_requests
      SET processing_token = ?1, processing_until = ?2, updated_at = ?3
      WHERE id = ?4 AND status NOT IN ('sealed', 'rejected', 'failed')
        AND (processing_until IS NULL OR processing_until < ?3)
    `)
    .bind(holder, now + 300_000, now, id)
    .run();
  return Number(result.meta.changes) === 1;
}

export async function releaseCertification(
  id: string,
  holder: string,
): Promise<void> {
  await certificationDatabase()
    .prepare(`
      UPDATE certification_requests
      SET processing_token = NULL, processing_until = NULL
      WHERE id = ?1 AND processing_token = ?2
    `)
    .bind(id, holder)
    .run();
}

export async function updateCertification(
  id: string,
  holder: string,
  values: Record<string, string | number | null>,
): Promise<void> {
  const allowed = new Set([
    'status',
    'current_case',
    'results_json',
    'report_json',
    'safety_score',
    'passed_checks',
    'total_checks',
    'critical_failures',
    'evidence_root',
    'evidence_transaction',
    'evidence_digest',
    'seal_id',
    'seal_transaction',
    'seal_expires_at',
    'gate_admitted',
    'last_error',
    'updated_at',
  ]);
  const entries = Object.entries(values);
  if (entries.length === 0 || entries.some(([key]) => !allowed.has(key))) {
    throw new Error('Invalid certification update');
  }
  const assignments = entries
    .map(([key], index) => `${key} = ?${index + 1}`)
    .join(', ');
  const result = await certificationDatabase()
    .prepare(
      `UPDATE certification_requests SET ${assignments} WHERE id = ?${entries.length + 1} AND processing_token = ?${entries.length + 2}`,
    )
    .bind(...entries.map(([, value]) => value), id, holder)
    .run();
  if (Number(result.meta.changes) !== 1)
    throw new Error('Certification update lost its processing lease');
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

export async function acquireIssuerLock(
  holder: string,
  now: number,
): Promise<boolean> {
  const result = await certificationDatabase()
    .prepare(`
      UPDATE certifier_locks SET holder = ?1, lease_until = ?2
      WHERE name = 'issuer' AND (holder IS NULL OR lease_until < ?3)
    `)
    .bind(holder, now + 600_000, now)
    .run();
  return Number(result.meta.changes) === 1;
}

export async function releaseIssuerLock(holder: string): Promise<void> {
  await certificationDatabase()
    .prepare(
      "UPDATE certifier_locks SET holder = NULL, lease_until = 0 WHERE name = 'issuer' AND holder = ?1",
    )
    .bind(holder)
    .run();
}

export function isTerminalStatus(status: CertificationStatus): boolean {
  return status === 'sealed' || status === 'rejected' || status === 'failed';
}
