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
