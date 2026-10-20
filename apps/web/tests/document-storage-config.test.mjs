import assert from "node:assert/strict";
import test from "node:test";
import {
  isCloudStorageCredentialed,
  requiresCloudStorage,
  resolveDocumentStorageConfiguration,
} from "../src/lib/document-storage-config.ts";

test("cloud storage credentials require a private store credential", () => {
  assert.equal(isCloudStorageCredentialed({}), false);
  assert.equal(
    isCloudStorageCredentialed({ BLOB_READ_WRITE_TOKEN: "synthetic-token" }),
    true,
  );
  assert.equal(
    isCloudStorageCredentialed({
      BLOB_STORE_ID: "store",
      VERCEL_OIDC_TOKEN: "oidc",
    }),
    true,
  );
  assert.equal(
    isCloudStorageCredentialed({ BLOB_STORE_ID: "store" }),
    false,
  );
});

test("staging and production fail closed without cloud storage", () => {
  assert.equal(requiresCloudStorage({ NODE_ENV: "development" }), false);
  assert.equal(requiresCloudStorage({ VERCEL: "1" }), true);
  assert.throws(
    () => resolveDocumentStorageConfiguration({ NODE_ENV: "production" }),
    /Private Vercel Blob configuration is required/,
  );
  assert.deepEqual(
    resolveDocumentStorageConfiguration({
      NODE_ENV: "production",
      BLOB_READ_WRITE_TOKEN: "synthetic-token",
    }),
    { kind: "vercel-blob" },
  );
});
