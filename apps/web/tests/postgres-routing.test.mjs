import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesBelow(path) : [path];
      }),
    )
  ).flat();
}

test("web routes never import a SQLite connection directly", async () => {
  const routeFiles = (await filesBelow(join(sourceRoot, "app"))).filter(
    (path) => /\.(?:ts|tsx)$/.test(path),
  );
  for (const path of routeFiles) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(
      source,
      /documentDatabase|node:sqlite|DatabaseSync/,
      path,
    );
  }
});

test("local SQLite entry points fail closed when PostgreSQL is selected", async () => {
  const documents = await readFile(
    join(sourceRoot, "lib/document-store.ts"),
    "utf8",
  );
  const auth = await readFile(join(sourceRoot, "lib/demo-auth.ts"), "utf8");
  assert.match(
    documents,
    /function documentDatabase\(\)[\s\S]*?if \(isWebPostgresConfigured\(\)\)[\s\S]*?SQLite document persistence is disabled/,
  );
  assert.match(
    auth,
    /function db\(\)[\s\S]*?if \(isWebPostgresConfigured\(\)\)[\s\S]*?SQLite authentication persistence is disabled/,
  );
});

test("the PostgreSQL migration stores references, not document bytes", async () => {
  const migration = await readFile(
    join(sourceRoot, "../migrations/postgres/001_initial.sql"),
    "utf8",
  );
  assert.match(migration, /CREATE TABLE web\.documents/);
  assert.match(migration, /storage_key TEXT NOT NULL UNIQUE/);
  assert.match(migration, /CREATE TABLE web\.document_chunks/);
  assert.match(migration, /CREATE TABLE web\.document_study_progress/);
  assert.match(migration, /CREATE TABLE web\.chat_sessions/);
  assert.match(migration, /CREATE TABLE web\.message_citations/);
  assert.doesNotMatch(migration, /\b(?:BYTEA|BLOB)\b/i);
});
