-- Phase 2 Hermes Intake Engine additive migration.
-- No destructive statements. Safe to run after schema.sql/schema_hermes.sql.

ALTER TABLE documents ADD COLUMN file_hash TEXT;
ALTER TABLE documents ADD COLUMN duplicate_of_document_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_documents_hash_dedupe
  ON documents(client_id, tax_year, file_hash);

CREATE TABLE IF NOT EXISTS document_intake_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL,
  client_id INTEGER NOT NULL,
  tax_year INTEGER NOT NULL,
  classification TEXT NOT NULL,
  organizer_category TEXT NOT NULL,
  workpaper_bucket TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0,
  duplicate_of_document_id INTEGER,
  requires_human_review INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  FOREIGN KEY (duplicate_of_document_id) REFERENCES documents(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_intake_results_document ON document_intake_results(document_id);
CREATE INDEX IF NOT EXISTS idx_intake_results_client_year ON document_intake_results(client_id, tax_year);
