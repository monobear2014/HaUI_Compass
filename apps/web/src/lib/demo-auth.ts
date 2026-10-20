import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import {
  isWebPostgresConfigured,
  webPostgresPool,
  withWebPostgresTransaction,
} from "./web-database";

// Local demo only: identities persist; all identities share the fictional API workspace.
export const SESSION_COOKIE = "compass_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export type DemoUser = { id: string; username: string; name: string };
type UserRow = DemoUser & { salt: string; password_hash: string };
const deriveKey = promisify(scrypt);
let database: DatabaseSync | undefined;

function db() {
  if (isWebPostgresConfigured())
    throw new Error(
      "SQLite authentication persistence is disabled in PostgreSQL mode",
    );
  if (database) return database;
  const directory =
    process.env.COMPASS_STORAGE_DIR ||
    (process.env.COMPASS_TEST_STORAGE === "1"
      ? join(process.cwd(), ".playwright-data")
      : join(process.cwd(), ".demo-auth"));
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, "accounts.sqlite");
  const connection = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  connection.exec(`
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS failed_logins (
      username TEXT NOT NULL, attempted_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_avatars (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, image TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      birth_date TEXT, major TEXT NOT NULL DEFAULT '', bio TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS oauth_accounts (
      provider TEXT NOT NULL, subject TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (provider, subject), UNIQUE (provider, user_id)
    );
  `);
  database = connection;
  return connection;
}

async function passwordHash(password: string, salt: string) {
  return (await deriveKey(password, salt, 64)) as Buffer;
}

function demoAccountEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.COMPASS_DEMO_AUTH === "1"
  );
}

async function seedDemoUser() {
  if (!demoAccountEnabled()) return;
  if (isWebPostgresConfigured()) {
    const exists = await webPostgresPool().query(
      "SELECT id FROM web.users WHERE username = $1",
      ["demo"],
    );
    if (exists.rowCount) return;
    const salt = randomBytes(16).toString("hex");
    const hash = await passwordHash("haui123", salt);
    await webPostgresPool().query(
      `INSERT INTO web.users (id, username, name, salt, password_hash)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
      ["student-demo", "demo", "Sinh viên HaUI", salt, hash.toString("hex")],
    );
    return;
  }
  const connection = db();
  if (connection.prepare("SELECT id FROM users WHERE username = ?").get("demo"))
    return;
  const salt = randomBytes(16).toString("hex");
  const hash = await passwordHash("haui123", salt);
  // Two simultaneous first requests may seed; the unique username makes this idempotent.
  connection
    .prepare("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)")
    .run("student-demo", "demo", "Sinh viên HaUI", salt, hash.toString("hex"));
}

export function publicUser(row: DemoUser): DemoUser {
  return { id: row.id, username: row.username, name: row.name };
}

export class AuthError extends Error {
  constructor(
    public code: string,
    public status = 400,
  ) {
    super(code);
  }
}

export async function authenticate(username: string, password: string) {
  await seedDemoUser();
  if (isWebPostgresConfigured())
    return authenticatePostgres(username, password);
  const connection = db();
  const cutoff = Date.now() - 60_000;
  connection
    .prepare("DELETE FROM failed_logins WHERE attempted_at < ?")
    .run(cutoff);
  const attempts = connection
    .prepare("SELECT COUNT(*) AS count FROM failed_logins WHERE username = ?")
    .get(username) as { count: number };
  if (attempts.count >= 5) throw new AuthError("too_many_attempts", 429);
  const row = connection
    .prepare("SELECT * FROM users WHERE username = ?")
    .get(username) as UserRow | undefined;
  // Always perform scrypt, including for an unknown username.
  const actual = await passwordHash(
    password,
    row?.salt ?? "unknown-account-salt",
  );
  const expected = row
    ? Buffer.from(row.password_hash, "hex")
    : Buffer.alloc(64);
  if (
    !timingSafeEqual(actual, expected) ||
    !row ||
    (row.id === "student-demo" && !demoAccountEnabled())
  ) {
    connection
      .prepare("INSERT INTO failed_logins VALUES (?, ?)")
      .run(username, Date.now());
    throw new AuthError("invalid_credentials", 401);
  }
  connection
    .prepare("DELETE FROM failed_logins WHERE username = ?")
    .run(username);
  return publicUser(row);
}

async function authenticatePostgres(username: string, password: string) {
  const result = await withWebPostgresTransaction(async (client) => {
    // Serialize failed-attempt accounting for this username across instances.
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [username],
    );
    const cutoff = Date.now() - 60_000;
    await client.query(
      "DELETE FROM web.failed_logins WHERE username = $1 AND attempted_at < $2",
      [username, cutoff],
    );
    const attempts = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM web.failed_logins WHERE username = $1",
      [username],
    );
    if (Number(attempts.rows[0]?.count ?? 0) >= 5)
      return { error: "too_many_attempts" as const };

    const lookup = await client.query<UserRow>(
      "SELECT id, username, name, salt, password_hash FROM web.users WHERE username = $1",
      [username],
    );
    const row = lookup.rows[0];
    const actual = await passwordHash(
      password,
      row?.salt ?? "unknown-account-salt",
    );
    const expected = row
      ? Buffer.from(row.password_hash, "hex")
      : Buffer.alloc(64);
    if (
      !timingSafeEqual(actual, expected) ||
      !row ||
      (row.id === "student-demo" && !demoAccountEnabled())
    ) {
      await client.query(
        "INSERT INTO web.failed_logins (username, attempted_at) VALUES ($1, $2)",
        [username, Date.now()],
      );
      return { error: "invalid_credentials" as const };
    }

    await client.query("DELETE FROM web.failed_logins WHERE username = $1", [
      username,
    ]);
    return { user: publicUser(row) };
  });

  if ("error" in result) {
    if (result.error === "too_many_attempts")
      throw new AuthError("too_many_attempts", 429);
    throw new AuthError("invalid_credentials", 401);
  }
  return result.user;
}

export async function registerUser(
  username: string,
  password: string,
  name: string,
) {
  await seedDemoUser();
  if (
    !/^[a-z0-9_.-]{3,32}$/.test(username) ||
    name.length < 2 ||
    name.length > 60 ||
    password.length < 6 ||
    password.length > 128
  )
    throw new AuthError("invalid_registration");
  if (isWebPostgresConfigured()) {
    const user = { id: randomUUID(), username, name };
    const salt = randomBytes(16).toString("hex");
    const hash = await passwordHash(password, salt);
    try {
      await webPostgresPool().query(
        `INSERT INTO web.users (id, username, name, salt, password_hash)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, username, name, salt, hash.toString("hex")],
      );
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23505"
      )
        throw new AuthError("username_taken", 409);
      throw error;
    }
    return user;
  }
  if (db().prepare("SELECT id FROM users WHERE username = ?").get(username))
    throw new AuthError("username_taken", 409);
  const user = { id: randomUUID(), username, name };
  const salt = randomBytes(16).toString("hex");
  const hash = await passwordHash(password, salt);
  try {
    db()
      .prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)")
      .run(user.id, username, name, salt, hash.toString("hex"));
  } catch (error) {
    if (db().prepare("SELECT id FROM users WHERE username = ?").get(username))
      throw new AuthError("username_taken", 409);
    throw error;
  }
  return user;
}

// Google identities are keyed by the verified subject, never by email or a
// user-chosen username. Existing password accounts are not implicitly linked.
export async function getOrCreateGoogleUser(
  subject: string,
  displayName: string,
) {
  if (!subject || subject.length > 255) throw new AuthError("invalid_input");
  const name =
    displayName
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .trim()
      .slice(0, 60) || "Google user";
  const user = {
    id: randomUUID(),
    username: `g_${randomBytes(15).toString("hex")}`,
    name,
  };
  // There is no usable password for a provider-only identity.
  const salt = randomBytes(16).toString("hex");
  const hash = randomBytes(64).toString("hex");
  if (isWebPostgresConfigured()) {
    return withWebPostgresTransaction(async (client) => {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 3))",
        [subject],
      );
      const found = await client.query<DemoUser>(
        `SELECT u.id, u.username, u.name FROM web.oauth_accounts a
         JOIN web.users u ON u.id = a.user_id WHERE a.provider = 'google' AND a.subject = $1`,
        [subject],
      );
      if (found.rows[0]) return publicUser(found.rows[0]);
      await client.query(
        "INSERT INTO web.users (id, username, name, salt, password_hash) VALUES ($1, $2, $3, $4, $5)",
        [user.id, user.username, user.name, salt, hash],
      );
      await client.query(
        "INSERT INTO web.oauth_accounts (provider, subject, user_id) VALUES ('google', $1, $2)",
        [subject, user.id],
      );
      return user;
    });
  }
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const found = connection
      .prepare(
        `SELECT u.id, u.username, u.name FROM oauth_accounts a
       JOIN users u ON u.id = a.user_id WHERE a.provider = 'google' AND a.subject = ?`,
      )
      .get(subject) as DemoUser | undefined;
    if (found) {
      connection.exec("COMMIT");
      return publicUser(found);
    }
    connection
      .prepare("INSERT INTO users VALUES (?, ?, ?, ?, ?)")
      .run(user.id, user.username, user.name, salt, hash);
    connection
      .prepare(
        "INSERT INTO oauth_accounts (provider, subject, user_id) VALUES ('google', ?, ?)",
      )
      .run(subject, user.id);
    connection.exec("COMMIT");
    return user;
  } catch (error) {
    connection.exec("ROLLBACK");
    throw error;
  }
}

const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function createSession(user: DemoUser) {
  const token = randomBytes(32).toString("base64url");
  if (isWebPostgresConfigured()) {
    await withWebPostgresTransaction(async (client) => {
      await client.query("DELETE FROM web.sessions WHERE expires_at <= $1", [
        Date.now(),
      ]);
      await client.query(
        "INSERT INTO web.sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
        [tokenHash(token), user.id, Date.now() + SESSION_SECONDS * 1000],
      );
    });
    return token;
  }
  db().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db()
    .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
    .run(tokenHash(token), user.id, Date.now() + SESSION_SECONDS * 1000);
  return token;
}

export async function getSessionUser(token?: string) {
  if (isWebPostgresConfigured()) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
    const result = await webPostgresPool().query<DemoUser>(
      `SELECT u.id, u.username, u.name FROM web.sessions s
       JOIN web.users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > $2`,
      [tokenHash(token), Date.now()],
    );
    const user = result.rows[0];
    return user && (user.id !== "student-demo" || demoAccountEnabled())
      ? publicUser(user)
      : null;
  }
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const user = db()
    .prepare(
      `SELECT u.id, u.username, u.name FROM sessions s
    JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash(token), Date.now()) as DemoUser | undefined;
  return user && (user.id !== "student-demo" || demoAccountEnabled())
    ? publicUser(user)
    : null;
}

export async function revokeSession(token?: string) {
  if (isWebPostgresConfigured()) {
    if (token)
      await webPostgresPool().query(
        "DELETE FROM web.sessions WHERE token_hash = $1",
        [tokenHash(token)],
      );
    return;
  }
  if (token)
    db()
      .prepare("DELETE FROM sessions WHERE token_hash = ?")
      .run(tokenHash(token));
}

export function sameOrigin(request: Request) {
  // Browser mutations must carry the expected Origin. CLI/test callers must do the same.
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (process.env.COMPASS_WEB_ORIGIN)
    return origin === process.env.COMPASS_WEB_ORIGIN;
  try {
    const url = new URL(origin);
    const target = new URL(request.url);
    // Next dev normalizes Request.url to localhost, while the browser may use 127.0.0.1.
    const localAliases =
      process.env.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) &&
      ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
      url.port === target.port;
    return (
      (url.host === request.headers.get("host") || localAliases) &&
      url.protocol === target.protocol
    );
  } catch {
    return false;
  }
}

export type AccountProfile = {
  birth_date: string | null;
  major: string;
  bio: string;
};
export async function accountDetails(user: DemoUser) {
  if (isWebPostgresConfigured()) {
    const result = await webPostgresPool().query<
      AccountProfile & { google: boolean }
    >(
      `SELECT p.birth_date, COALESCE(p.major, '') AS major, COALESCE(p.bio, '') AS bio,
       EXISTS(SELECT 1 FROM web.oauth_accounts WHERE user_id=$1 AND provider='google') AS google
       FROM web.users u LEFT JOIN web.account_profiles p ON p.user_id=u.id WHERE u.id=$1`,
      [user.id],
    );
    const row = result.rows[0];
    if (!row) throw new AuthError("unauthorized", 401);
    return {
      user,
      profile: { birth_date: row.birth_date, major: row.major, bio: row.bio },
      login_method: row.google ? "google" : "password",
    };
  }
  const profile = db()
    .prepare(
      "SELECT birth_date, major, bio FROM account_profiles WHERE user_id=?",
    )
    .get(user.id) as AccountProfile | undefined;
  const google = db()
    .prepare(
      "SELECT 1 FROM oauth_accounts WHERE user_id=? AND provider='google'",
    )
    .get(user.id);
  return {
    user,
    profile: profile || { birth_date: null, major: "", bio: "" },
    login_method: google ? "google" : "password",
  };
}

export async function updateAccountProfile(
  user: DemoUser,
  name: string,
  profile: AccountProfile,
) {
  if (isWebPostgresConfigured()) {
    await withWebPostgresTransaction(async (client) => {
      await client.query("UPDATE web.users SET name=$2 WHERE id=$1", [
        user.id,
        name,
      ]);
      await client.query(
        `INSERT INTO web.account_profiles(user_id,birth_date,major,bio) VALUES($1,$2,$3,$4)
        ON CONFLICT(user_id) DO UPDATE SET birth_date=EXCLUDED.birth_date,major=EXCLUDED.major,bio=EXCLUDED.bio`,
        [user.id, profile.birth_date, profile.major, profile.bio],
      );
    });
  } else {
    const connection = db();
    connection.exec("BEGIN IMMEDIATE");
    try {
      connection
        .prepare("UPDATE users SET name=? WHERE id=?")
        .run(name, user.id);
      connection
        .prepare(
          `INSERT INTO account_profiles(user_id,birth_date,major,bio) VALUES(?,?,?,?)
        ON CONFLICT(user_id) DO UPDATE SET birth_date=excluded.birth_date,major=excluded.major,bio=excluded.bio`,
        )
        .run(user.id, profile.birth_date, profile.major, profile.bio);
      connection.exec("COMMIT");
    } catch (error) {
      connection.exec("ROLLBACK");
      throw error;
    }
  }
  return { ...user, name };
}

export async function changeAccountPassword(
  user: DemoUser,
  current: string,
  next: string,
) {
  if ((await accountDetails(user)).login_method === "google")
    throw new AuthError("google_managed", 409);
  // Reuse the login limiter. Verification and a compare-and-swap prevent concurrent resets.
  await authenticate(user.username, current);
  const row = isWebPostgresConfigured()
    ? (
        await webPostgresPool().query<UserRow>(
          "SELECT salt,password_hash FROM web.users WHERE id=$1",
          [user.id],
        )
      ).rows[0]
    : (db()
        .prepare("SELECT salt,password_hash FROM users WHERE id=?")
        .get(user.id) as UserRow | undefined);
  if (!row) throw new AuthError("unauthorized", 401);
  const actual = await passwordHash(current, row.salt),
    expected = Buffer.from(row.password_hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new AuthError("invalid_credentials", 401);
  if (current === next) throw new AuthError("password_unchanged");
  const salt = randomBytes(16).toString("hex"),
    hash = (await passwordHash(next, salt)).toString("hex");
  const token = randomBytes(32).toString("base64url"),
    expires = Date.now() + SESSION_SECONDS * 1000;
  if (isWebPostgresConfigured()) {
    await withWebPostgresTransaction(async (client) => {
      const updated = await client.query(
        "UPDATE web.users SET salt=$2,password_hash=$3 WHERE id=$1 AND password_hash=$4",
        [user.id, salt, hash, row.password_hash],
      );
      if (updated.rowCount !== 1)
        throw new AuthError("credentials_changed", 409);
      await client.query("DELETE FROM web.sessions WHERE user_id=$1", [
        user.id,
      ]);
      await client.query(
        "INSERT INTO web.sessions(token_hash,user_id,expires_at) VALUES($1,$2,$3)",
        [tokenHash(token), user.id, expires],
      );
    });
  } else {
    const connection = db();
    connection.exec("BEGIN IMMEDIATE");
    try {
      const updated = connection
        .prepare(
          "UPDATE users SET salt=?,password_hash=? WHERE id=? AND password_hash=?",
        )
        .run(salt, hash, user.id, row.password_hash);
      if (updated.changes !== 1)
        throw new AuthError("credentials_changed", 409);
      connection.prepare("DELETE FROM sessions WHERE user_id=?").run(user.id);
      connection
        .prepare("INSERT INTO sessions VALUES(?,?,?)")
        .run(tokenHash(token), user.id, expires);
      connection.exec("COMMIT");
    } catch (error) {
      connection.exec("ROLLBACK");
      throw error;
    }
  }
  return token;
}

export async function accountAvatar(user: DemoUser): Promise<string | null> {
  if (isWebPostgresConfigured()) {
    const result = await webPostgresPool().query(
      "SELECT image FROM web.account_avatars WHERE user_id=$1",
      [user.id],
    );
    return result.rows[0]?.image ?? null;
  }
  const row = db()
    .prepare("SELECT image FROM account_avatars WHERE user_id=?")
    .get(user.id) as { image: string } | undefined;
  return row?.image ?? null;
}
export async function saveAccountAvatar(user: DemoUser, image: string | null) {
  if (isWebPostgresConfigured()) {
    if (image === null)
      await webPostgresPool().query(
        "DELETE FROM web.account_avatars WHERE user_id=$1",
        [user.id],
      );
    else
      await webPostgresPool().query(
        "INSERT INTO web.account_avatars(user_id,image) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET image=EXCLUDED.image",
        [user.id, image],
      );
  } else {
    if (image === null)
      db().prepare("DELETE FROM account_avatars WHERE user_id=?").run(user.id);
    else
      db()
        .prepare(
          "INSERT INTO account_avatars(user_id,image) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET image=excluded.image",
        )
        .run(user.id, image);
  }
}
