import assert from "node:assert/strict";
import test from "node:test";
import { resolveCompassApiUrl } from "../src/lib/compass-api-config.ts";

test("local development keeps the loopback API default", () => {
  assert.equal(
    resolveCompassApiUrl({ NODE_ENV: "development" }),
    "http://127.0.0.1:8000",
  );
});

test("staging and production require an absolute HTTP(S) service URL", () => {
  assert.throws(
    () => resolveCompassApiUrl({ VERCEL: "1" }),
    /COMPASS_API_URL is required/,
  );
  assert.throws(
    () =>
      resolveCompassApiUrl({
        NODE_ENV: "production",
        COMPASS_API_URL: "api.internal",
      }),
    /absolute HTTP\(S\) URL/,
  );
  assert.equal(
    resolveCompassApiUrl({
      VERCEL: "1",
      COMPASS_API_URL: "https://api.example.test/",
    }),
    "https://api.example.test/",
  );
});
