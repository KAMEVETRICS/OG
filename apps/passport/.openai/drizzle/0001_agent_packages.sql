CREATE TABLE IF NOT EXISTS agent_packages (
  agent_id TEXT NOT NULL,
  implementation_hash TEXT NOT NULL,
  package_json TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  owner_address TEXT NOT NULL,
  storage_root TEXT NOT NULL,
  storage_transaction TEXT NOT NULL,
  storage_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (agent_id, implementation_hash)
);

CREATE INDEX IF NOT EXISTS agent_packages_agent_updated_idx
ON agent_packages(agent_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS agent_packages_owner_updated_idx
ON agent_packages(owner_address, updated_at DESC);
