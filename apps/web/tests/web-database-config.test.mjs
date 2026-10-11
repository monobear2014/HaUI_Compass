import assert from "node:assert/strict";
import test from "node:test";
import { resolveWebDatabaseConfiguration } from "../src/lib/web-database-config.ts";

test("local development keeps the SQLite adapter when no web database is set", () => {
  assert.deepEqual(resolveWebDatabaseConfiguration({ NODE_ENV: "development" }), {
    kind: "sqlite",
  });
});

test("a dedicated web PostgreSQL URL selects the persistent adapter", () => {
  assert.deepEqual(
    resolveWebDatabaseConfiguration({
      NODE_ENV: "production",
      HAUI_COMPASS_WEB_DATABASE_URL: "postgresql://staging.invalid/db",
    }),
    {
      kind: "postgres",
      connectionString: "postgresql://staging.invalid/db",
    },
  );
});

test("production without the web PostgreSQL URL fails instead of using SQLite", () => {
  assert.throws(
    () => resolveWebDatabaseConfiguration({ NODE_ENV: "production" }),
    /HAUI_COMPASS_WEB_DATABASE_URL is required/,
  );
});

test("Vercel preview without the web PostgreSQL URL also fails closed", () => {
  assert.throws(
    () => resolveWebDatabaseConfiguration({ VERCEL: "1" }),
    /HAUI_COMPASS_WEB_DATABASE_URL is required/,
  );
});

test("the explicit local production test harness may use SQLite", () => {
  assert.deepEqual(
    resolveWebDatabaseConfiguration({
      NODE_ENV: "production",
      COMPASS_TEST_STORAGE: "1",
    }),
    { kind: "sqlite" },
  );
});
