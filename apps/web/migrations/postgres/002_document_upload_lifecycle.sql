ALTER TABLE web.documents
  DROP CONSTRAINT documents_ingestion_status_check;

ALTER TABLE web.documents
  ADD CONSTRAINT documents_ingestion_status_check
  CHECK (ingestion_status IN ('pending', 'uploaded', 'ingesting', 'ready', 'failed', 'unsupported'));

CREATE TABLE web.document_upload_intents (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES web.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL REFERENCES web.documents(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'text')),
  content_type TEXT NOT NULL,
  expected_size INTEGER NOT NULL CHECK (expected_size > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploaded', 'ingesting', 'ready', 'failed', 'expired')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt > 0),
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  completed_at TEXT,
  UNIQUE (id, owner),
  UNIQUE (document_id, attempt),
  FOREIGN KEY (document_id, owner) REFERENCES web.documents(id, owner) ON DELETE CASCADE
);
CREATE INDEX document_upload_intents_owner_status
  ON web.document_upload_intents (owner, status, updated_at DESC);
CREATE INDEX document_upload_intents_expiry
  ON web.document_upload_intents (expires_at);
