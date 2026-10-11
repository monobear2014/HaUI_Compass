CREATE TABLE web.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE web.failed_logins (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL,
  attempted_at BIGINT NOT NULL
);
CREATE INDEX failed_logins_username_time ON web.failed_logins (username, attempted_at);

CREATE TABLE web.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES web.users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE INDEX sessions_expiry ON web.sessions (expires_at);

CREATE TABLE web.documents (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES web.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('pdf', 'text')),
  size INTEGER NOT NULL CHECK (size > 0),
  created_at TEXT NOT NULL,
  headings JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(headings) = 'array'),
  storage_key TEXT NOT NULL UNIQUE,
  hash TEXT NOT NULL,
  ingestion_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (ingestion_status IN ('pending', 'ready', 'failed', 'unsupported')),
  UNIQUE (owner, hash),
  UNIQUE (id, owner)
);
CREATE INDEX documents_owner_created ON web.documents (owner, created_at DESC, id DESC);

CREATE TABLE web.document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES web.documents(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  heading TEXT,
  start_offset INTEGER NOT NULL CHECK (start_offset >= 0),
  end_offset INTEGER NOT NULL CHECK (end_offset >= start_offset),
  created_at TEXT NOT NULL,
  page_number INTEGER CHECK (page_number > 0 AND page_number <= 200),
  UNIQUE (document_id, chunk_index),
  UNIQUE (id, document_id)
);
CREATE INDEX document_chunks_document_order ON web.document_chunks (document_id, chunk_index);

CREATE TABLE web.document_study_progress (
  owner TEXT NOT NULL,
  document_id TEXT NOT NULL,
  covered JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(covered) = 'array'),
  mastered JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(mastered) = 'array'),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (owner, document_id),
  FOREIGN KEY (document_id, owner) REFERENCES web.documents(id, owner) ON DELETE CASCADE
);

CREATE TABLE web.chat_sessions (
  id TEXT PRIMARY KEY,
  study_set_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  generating_until TIMESTAMPTZ NOT NULL DEFAULT TIMESTAMPTZ 'epoch',
  generating_request TEXT,
  generating_token TEXT,
  sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  FOREIGN KEY (study_set_id, owner) REFERENCES web.documents(id, owner) ON DELETE CASCADE,
  UNIQUE (id, study_set_id, owner)
);
CREATE INDEX chat_sessions_owner_set_updated
  ON web.chat_sessions (owner, study_set_id, updated_at DESC, sequence DESC);

CREATE TABLE web.chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES web.chat_sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  request_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'failed', 'answered', 'abstained')),
  sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  UNIQUE (session_id, request_id, role)
);
CREATE INDEX chat_messages_session_order ON web.chat_messages (session_id, sequence);

CREATE TABLE web.message_citations (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES web.chat_messages(id) ON DELETE CASCADE,
  chunk_id TEXT NOT NULL REFERENCES web.document_chunks(id) ON DELETE CASCADE,
  citation_index INTEGER NOT NULL CHECK (citation_index > 0),
  UNIQUE (message_id, citation_index)
);
CREATE INDEX message_citations_chunk ON web.message_citations (chunk_id);
