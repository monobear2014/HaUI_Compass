import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../src/", import.meta.url));

test("presigned upload route scopes and authenticates every token", async () => {
  const source = await readFile(
    join(root, "app/api/documents/upload/route.ts"),
    "utf8",
  );
  assert.match(source, /handleUploadPresigned/);
  assert.match(source, /sameOrigin\(request\)/);
  assert.match(source, /authorizeUploadToken/);
  assert.match(source, /operations: \["put"\]/);
  assert.match(source, /allowedContentTypes/);
  assert.match(source, /maximumSizeInBytes/);
  assert.match(source, /allowOverwrite: false/);
  assert.match(source, /completeUploadIntent/);
});

test("browser completion data cannot choose the object identity", async () => {
  const source = await readFile(
    join(root, "lib/document-upload-lifecycle.ts"),
    "utf8",
  );
  assert.match(source, /payload\.storageKey !== pathname/);
  assert.match(source, /row\.storage_key !== trusted\.storageKey/);
  assert.match(source, /blob\.size !== row\.expected_size/);
  assert.match(source, /readDocumentContent\(claimedIntent\.storage_key\)/);
  assert.match(source, /status = 'uploaded'/);
  assert.match(source, /status = 'ingesting'/);
  assert.match(source, /retryUploadIntent/);
});

test("staging does not accept the legacy proxied upload path", async () => {
  const source = await readFile(
    join(root, "app/api/documents/route.ts"),
    "utf8",
  );
  assert.match(source, /direct_upload_required/);
  assert.match(source, /resolveDocumentStorageConfiguration/);
});
