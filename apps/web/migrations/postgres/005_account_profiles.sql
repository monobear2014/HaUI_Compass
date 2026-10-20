CREATE TABLE web.account_profiles (
  user_id TEXT PRIMARY KEY REFERENCES web.users(id) ON DELETE CASCADE,
  birth_date TEXT,
  major TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT ''
);
