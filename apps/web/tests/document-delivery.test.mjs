import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../src/", import.meta.url));

test("document delivery authorizes before streaming and does not buffer the cloud object", async () => {
  const route = await readFile(join(root, "app/api/documents/[id]/route.ts"), "utf8");
  const store = await readFile(join(root, "lib/document-store.ts"), "utf8");
  assert.match(route, /getSessionUser/);
  assert.match(route, /streamDocument\(user\.id/);
  assert.match(route, /new Response\(doc\.stream/);
  assert.doesNotMatch(route, /doc\.content/);
  assert.match(store, /streamDocumentContent\(row\.storage_key\)/);
});
