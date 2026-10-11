import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const connectionString = process.env.HAUI_COMPASS_WEB_DATABASE_URL?.trim();
if (!connectionString) {
  console.error("HAUI_COMPASS_WEB_DATABASE_URL is required to run web migrations");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 5_000,
});

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(1646847057)");
    await client.query("CREATE SCHEMA IF NOT EXISTS web");
    await client.query(`CREATE TABLE IF NOT EXISTS web.schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
    const applied = await client.query(
      "SELECT 1 FROM web.schema_migrations WHERE version = $1",
      [1],
    );
    if (applied.rowCount) {
      await client.query("COMMIT");
      console.log("Web PostgreSQL schema is current (revision 1)");
    } else {
      const migrationPath = new URL("../migrations/postgres/001_initial.sql", import.meta.url);
      const migration = await readFile(fileURLToPath(migrationPath), "utf8");
      await client.query(migration);
      await client.query("INSERT INTO web.schema_migrations (version) VALUES ($1)", [1]);
      await client.query("COMMIT");
      console.log("Applied web PostgreSQL migration revision 1");
    }
  } catch {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error("Web PostgreSQL migration failed; transaction was rolled back");
    process.exitCode = 1;
  } finally {
    client.release();
  }
} catch {
  console.error("Unable to connect to the web PostgreSQL database");
  process.exitCode = 1;
} finally {
  await pool.end();
}
