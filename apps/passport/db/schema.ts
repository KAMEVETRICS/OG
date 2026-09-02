export const certificationRequestsSchema = `
  CREATE TABLE IF NOT EXISTS certification_requests (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    implementation_hash TEXT NOT NULL,
    package_url TEXT NOT NULL,
    package_json TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    challenge_message TEXT NOT NULL,
    challenge_expires_at BIGINT NOT NULL,
    resume_token_hash TEXT,
    status TEXT NOT NULL,
    current_case INTEGER NOT NULL DEFAULT 0,
    results_json TEXT NOT NULL DEFAULT '[]',
    report_json TEXT,
    safety_score INTEGER,
    passed_checks INTEGER,
    total_checks INTEGER,
    critical_failures INTEGER,
    evidence_root TEXT,
    evidence_transaction TEXT,
    evidence_digest TEXT,
    seal_id TEXT,
    seal_transaction TEXT,
    seal_expires_at BIGINT,
    gate_admitted INTEGER,
    processing_token TEXT,
    processing_until BIGINT,
    last_error TEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
  )
`;

export const ownerCreatedIndexSchema = `
  CREATE INDEX IF NOT EXISTS certification_requests_owner_created_idx
  ON certification_requests(owner_address, created_at)
`;

export const statusUpdatedIndexSchema = `
  CREATE INDEX IF NOT EXISTS certification_requests_status_updated_idx
  ON certification_requests(status, updated_at)
`;

export const certifierLocksSchema = `
  CREATE TABLE IF NOT EXISTS certifier_locks (
    name TEXT PRIMARY KEY,
    holder TEXT,
    lease_until BIGINT NOT NULL DEFAULT 0
  )
`;

export const agentPackagesSchema = `
  CREATE TABLE IF NOT EXISTS agent_packages (
    agent_id TEXT NOT NULL,
    implementation_hash TEXT NOT NULL,
    package_json TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    owner_address TEXT NOT NULL,
    storage_root TEXT NOT NULL,
    storage_transaction TEXT NOT NULL,
    storage_digest TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (agent_id, implementation_hash)
  )
`;

export const agentPackagesUpdatedIndexSchema = `
  CREATE INDEX IF NOT EXISTS agent_packages_agent_updated_idx
  ON agent_packages(agent_id, updated_at DESC)
`;

export const agentPackagesOwnerIndexSchema = `
  CREATE INDEX IF NOT EXISTS agent_packages_owner_updated_idx
  ON agent_packages(owner_address, updated_at DESC)
`;
