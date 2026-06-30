-- Hermes Core v1 additive migration
-- Apply after schema.sql: wrangler d1 execute pts_tax_lab --file=schema_hermes.sql
-- No DROP statements — safe to run against an existing database.

CREATE TABLE IF NOT EXISTS agent_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT UNIQUE NOT NULL,
  client_id INTEGER,
  document_id INTEGER,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input_hash TEXT,
  input_summary TEXT,
  output_json TEXT,
  confidence REAL,
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  skipped_reason TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS agent_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  agent_name TEXT,
  sequence INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_artifacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  content_json TEXT NOT NULL,
  r2_key TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  memory_type TEXT NOT NULL,
  key TEXT NOT NULL,
  value_json TEXT NOT NULL,
  source_run_id TEXT,
  confidence REAL,
  expires_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE(client_id, memory_type, key)
);

CREATE TABLE IF NOT EXISTS citations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  citation_type TEXT NOT NULL,
  reference TEXT NOT NULL,
  description TEXT,
  url TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS route_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  input_type TEXT NOT NULL,
  chosen_agents TEXT NOT NULL,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS model_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  run_id TEXT,
  client_id INTEGER,
  actor TEXT NOT NULL DEFAULT 'system',
  description TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_client ON agent_runs(client_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_hash ON agent_runs(input_hash);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs(status);
CREATE INDEX IF NOT EXISTS idx_agent_memory_client_key ON agent_memory(client_id, memory_type, key);
CREATE INDEX IF NOT EXISTS idx_citations_run ON citations(run_id);
CREATE INDEX IF NOT EXISTS idx_model_usage_run ON model_usage(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_client ON audit_events(client_id);
