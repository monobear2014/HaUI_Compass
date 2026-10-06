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

// Local demo only: identities persist; all identities share the fictional API workspace.
export const SESSION_COOKIE = "compass_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export type DemoUser = { id: string; username: string; name: string };
type UserRow = DemoUser & { salt: string; password_hash: string };
const deriveKey = promisify(scrypt);
let database: DatabaseSync | undefined;

function db() {
  if (database) return database;
  const directory =
    process.env.COMPASS_TEST_STORAGE === "1"
      ? join(process.cwd(), ".playwright-data")
      : join(process.cwd(), ".demo-auth");
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

export function createSession(user: DemoUser) {
  const token = randomBytes(32).toString("base64url");
  db().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(Date.now());
  db()
    .prepare("INSERT INTO sessions VALUES (?, ?, ?)")
    .run(tokenHash(token), user.id, Date.now() + SESSION_SECONDS * 1000);
  return token;
}

export function getSessionUser(token?: string) {
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

export function revokeSession(token?: string) {
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
