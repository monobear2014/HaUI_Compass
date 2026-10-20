CREATE TABLE web.oauth_accounts (
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES web.users(id) ON DELETE CASCADE,
  PRIMARY KEY (provider, subject),
  UNIQUE (provider, user_id)
);
