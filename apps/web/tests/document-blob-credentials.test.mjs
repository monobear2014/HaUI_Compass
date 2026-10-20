import assert from "node:assert/strict";
import test from "node:test";
import { get } from "@vercel/blob";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { documentBlobCredentials } from "../src/lib/document-storage-config.ts";

test("private content reads use the configured token when Vercel also provides OIDC", async (t) => {
  const readWriteToken = "vercel_blob_rw_synthetic_credential";
  const originalOidc = process.env.VERCEL_OIDC_TOKEN;
  const originalStore = process.env.BLOB_STORE_ID;
  const originalReadWrite = process.env.BLOB_READ_WRITE_TOKEN;
  const originalDispatcher = getGlobalDispatcher();
  const mock = new MockAgent();
  mock.disableNetConnect();
  setGlobalDispatcher(mock);
  const oidc = `synthetic.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.synthetic`;
  process.env.VERCEL_OIDC_TOKEN = oidc;
  process.env.BLOB_STORE_ID = "store_synthetic";
  process.env.BLOB_READ_WRITE_TOKEN = readWriteToken;
  t.after(async () => {
    setGlobalDispatcher(originalDispatcher);
    await mock.close();
    for (const [key, value] of Object.entries({
      VERCEL_OIDC_TOKEN: originalOidc,
      BLOB_STORE_ID: originalStore,
      BLOB_READ_WRITE_TOKEN: originalReadWrite,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const origin = mock.get("https://synthetic.private.blob.vercel-storage.com");
  origin
    .intercept({
      path: "/documents/synthetic.md",
      headers: { authorization: `Bearer ${oidc}` },
    })
    .reply(403, "");
  origin
    .intercept({
      path: "/documents/synthetic.md?cache=0",
      headers: { authorization: `Bearer ${readWriteToken}` },
    })
    .reply(200, "# Synthetic notes", {
      headers: { "content-type": "text/markdown" },
    });
  // The SDK's implicit credential path selects OIDC, even when a read/write
  // credential was intended. No request leaves this mocked fetch boundary.
  await assert.rejects(get("documents/synthetic.md", { access: "private" }));
  const result = await get("documents/synthetic.md", {
    ...documentBlobCredentials(),
    access: "private",
    useCache: false,
  });
  assert.equal(result.statusCode, 200);
  assert.equal(await new Response(result.stream).text(), "# Synthetic notes");
  mock.assertNoPendingInterceptors();
});

test("OIDC remains available when no read/write credential is configured", () => {
  assert.deepEqual(documentBlobCredentials({}), { token: undefined });
});
