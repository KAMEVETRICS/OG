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

export const certifierQuotasSchema = `
  CREATE TABLE IF NOT EXISTS certifier_quotas (
    day TEXT NOT NULL,
    key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, key)
  )
`;

export const bumpQuotaSchema = `
  CREATE OR REPLACE FUNCTION bump_quota(
    p_window TEXT,
    p_key TEXT,
    p_limit INTEGER
  ) RETURNS TEXT
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_count INTEGER;
  BEGIN
    INSERT INTO certifier_quotas(day, key, count) VALUES (p_window, p_key, 1)
    ON CONFLICT (day, key) DO UPDATE
      SET count = certifier_quotas.count + 1
      WHERE certifier_quotas.count < p_limit
    RETURNING count INTO v_count;
    IF v_count IS NULL THEN
      RAISE EXCEPTION 'rate_limit';
    END IF;
    RETURN 'ok';
  END;
  $$
`;

export const createSignedCertificationSchema = `
  CREATE OR REPLACE FUNCTION create_signed_certification(
    p_id TEXT,
    p_agent_id TEXT,
    p_implementation_hash TEXT,
    p_package_url TEXT,
    p_package_json TEXT,
    p_agent_name TEXT,
    p_owner TEXT,
    p_challenge_message TEXT,
    p_expires_at BIGINT,
    p_resume_hash TEXT,
    p_now BIGINT,
    p_day TEXT,
    p_owner_limit INTEGER,
    p_global_limit INTEGER
  ) RETURNS TEXT
  LANGUAGE plpgsql
  AS $$
  DECLARE
    v_owner INTEGER;
    v_global INTEGER;
    v_id TEXT;
  BEGIN
    IF p_expires_at <= p_now THEN
      RAISE EXCEPTION 'challenge_expired';
    END IF;

    INSERT INTO certifier_quotas(day, key, count) VALUES (p_day, p_owner, 1)
    ON CONFLICT (day, key) DO UPDATE
      SET count = certifier_quotas.count + 1
      WHERE certifier_quotas.count < p_owner_limit
    RETURNING count INTO v_owner;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'owner_rate_limit';
    END IF;

    INSERT INTO certifier_quotas(day, key, count) VALUES (p_day, 'global', 1)
    ON CONFLICT (day, key) DO UPDATE
      SET count = certifier_quotas.count + 1
      WHERE certifier_quotas.count < p_global_limit
    RETURNING count INTO v_global;
    IF v_global IS NULL THEN
      RAISE EXCEPTION 'global_rate_limit';
    END IF;

    INSERT INTO certification_requests (
      id, agent_id, implementation_hash, package_url, package_json, agent_name,
      owner_address, challenge_message, challenge_expires_at, resume_token_hash,
      status, current_case, results_json, report_json, safety_score, passed_checks,
      total_checks, critical_failures, evidence_root, evidence_transaction,
      evidence_digest, seal_id, seal_transaction, seal_expires_at, gate_admitted,
      processing_token, processing_until, last_error, created_at, updated_at
    ) VALUES (
      p_id, p_agent_id, p_implementation_hash, p_package_url, p_package_json, p_agent_name,
      p_owner, p_challenge_message, p_expires_at, p_resume_hash,
      'queued', 0, '[]', NULL, NULL, NULL,
      NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, p_now, p_now
    )
    ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'challenge_consumed';
    END IF;
    RETURN v_id;
  END;
  $$
`;
