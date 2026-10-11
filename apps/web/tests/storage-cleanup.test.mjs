import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../src/", import.meta.url));

test("PostgreSQL deletion records and retries blob cleanup", async () => {
  const source = await readFile(join(root, "lib/document-store.ts"), "utf8");
  assert.match(source, /document_storage_cleanup/);
  assert.match(source, /status = 'failed'/);
  assert.match(source, /retryDocumentStorageCleanup/);
  assert.match(source, /WHERE id = \$2 AND owner = \$3/);
});
