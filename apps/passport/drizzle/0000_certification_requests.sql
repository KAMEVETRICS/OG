CREATE TABLE IF NOT EXISTS certification_requests (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  package_url TEXT NOT NULL,
  package_json TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  challenge_message TEXT NOT NULL,
  challenge_expires_at INTEGER NOT NULL,
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
  seal_expires_at INTEGER,
  gate_admitted INTEGER,
  processing_token TEXT,
  processing_until INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS certification_requests_owner_created_idx
  ON certification_requests(owner_address, created_at);

CREATE INDEX IF NOT EXISTS certification_requests_status_updated_idx
  ON certification_requests(status, updated_at);

CREATE TABLE IF NOT EXISTS certifier_locks (
  name TEXT PRIMARY KEY,
  holder TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO certifier_locks(name, holder, lease_until)
  VALUES ('issuer', NULL, 0);
