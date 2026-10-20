CREATE TABLE web.account_avatars (user_id TEXT PRIMARY KEY REFERENCES web.users(id) ON DELETE CASCADE, image TEXT NOT NULL);
