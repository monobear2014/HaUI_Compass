import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../src/", import.meta.url));

test("cloud ingestion reads private objects and preserves existing extraction/chunking", async () => {
  const source = await readFile(
    join(root, "lib/document-upload-lifecycle.ts"),
    "utf8",
  );
  assert.match(source, /readDocumentContent\(claimedIntent\.storage_key\)/);
  assert.match(source, /extractPdf\(content\)/);
  assert.match(source, /chunkPages\(pages\)/);
  assert.match(source, /chunkText\(/);
  assert.doesNotMatch(source, /node:fs|node:path|\/tmp/);
});

test("cloud PDF delivery uses a short-lived signed URL after owner-scoped lookup", async () => {
  const source = await readFile(join(root, "lib/document-store.ts"), "utf8");
  assert.match(source, /WHERE owner = \$1 AND id = \$2/);
  assert.match(source, /signedDocumentContentUrl\(storageKey\)/);
  assert.match(source, /ingestion_status IN \('uploaded', 'ingesting', 'ready'\)/);
});
