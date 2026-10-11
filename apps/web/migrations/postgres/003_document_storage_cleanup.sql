CREATE TABLE web.document_storage_cleanup (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES web.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'failed', 'deleted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX document_storage_cleanup_owner_status
  ON web.document_storage_cleanup (owner, status, updated_at DESC);
