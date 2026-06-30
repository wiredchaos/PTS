PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  external_id TEXT UNIQUE,
  name TEXT NOT NULL,
  email TEXT,
  type TEXT DEFAULT 'standard',
  case_type TEXT DEFAULT 'standard',
  status TEXT DEFAULT 'active',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  tax_year INTEGER NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  extension TEXT,
  storage_key TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  upload_status TEXT NOT NULL DEFAULT 'uploaded',
  processing_status TEXT NOT NULL DEFAULT 'queued',
  classification TEXT NOT NULL DEFAULT 'unclassified',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS upload_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  tax_year INTEGER NOT NULL,
  request_id TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  completed_files INTEGER NOT NULL DEFAULT 0,
  failed_files INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS processing_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  processor TEXT NOT NULL DEFAULT 'deterministic-placeholder',
  error_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  tax_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  summary_json TEXT NOT NULL,
  missing_documents_json TEXT NOT NULL,
  reconciliations_json TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS organizer_checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  tax_year INTEGER NOT NULL,
  checklist_json TEXT NOT NULL,
  completion_percent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE(client_id, tax_year)
);

CREATE TABLE IF NOT EXISTS gamma_presentations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  url TEXT,
  status TEXT NOT NULL DEFAULT 'placeholder',
  source TEXT NOT NULL DEFAULT 'manual-or-agent-placeholder',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_config_refs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'kv'
);

CREATE INDEX IF NOT EXISTS idx_documents_client_year ON documents(client_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_upload_jobs_client_year ON upload_jobs(client_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_queue_status ON processing_queue(status);
CREATE INDEX IF NOT EXISTS idx_analysis_client_year ON analysis_results(client_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_clients_case_type ON clients(case_type);

-- Optional dev seed example. Keep client-specific examples in DB records only.
INSERT OR IGNORE INTO clients (id, external_id, name, email, type, case_type)
VALUES (1, 'client-david-crenshaw', 'David Crenshaw', NULL, 'individual', 'standard');
