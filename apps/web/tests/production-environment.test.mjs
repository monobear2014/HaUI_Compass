import assert from "node:assert/strict";
import { test } from "node:test";
import { productionEnvironmentProblems } from "../scripts/check-production-environment.mjs";

const complete = {
  VERCEL_ENV: "production",
  HAUI_COMPASS_WEB_DATABASE_URL: "postgresql://example.invalid/web",
  HAUI_COMPASS_DATABASE_URL: "postgresql+psycopg://example.invalid/api",
  COMPASS_WEB_ORIGIN: "https://example.invalid",
  COMPASS_SERVICE_KEY: "synthetic-service-key",
  BLOB_STORE_ID: "synthetic-private-store",
  BLOB_WEBHOOK_PUBLIC_KEY: "synthetic-public-key",
  BLOB_READ_WRITE_TOKEN: "synthetic-token",
  OPENAI_API_KEY: "synthetic-provider-key",
  HAUI_COMPASS_LLM_MODEL: "synthetic-model",
  HAUI_COMPASS_LLM_ENABLED: "true",
  HAUI_COMPASS_SIMULATED_WORKSPACES: "1",
};

test("local and Preview builds keep their own environment contract", () => {
  assert.deepEqual(productionEnvironmentProblems({}), []);
  assert.deepEqual(productionEnvironmentProblems({ VERCEL_ENV: "preview" }), []);
});

test("Production refuses an auth-only configuration and names missing capabilities", () => {
  const problems = productionEnvironmentProblems({
    VERCEL_ENV: "production",
    HAUI_COMPASS_WEB_DATABASE_URL: complete.HAUI_COMPASS_WEB_DATABASE_URL,
  });
  for (const name of ["HAUI_COMPASS_DATABASE_URL", "COMPASS_SERVICE_KEY", "BLOB_STORE_ID"])
    assert.ok(problems.includes(name));
  assert.ok(problems.includes("HAUI_COMPASS_SIMULATED_WORKSPACES=1"));
  assert.ok(problems.includes("HAUI_COMPASS_LLM_ENABLED=true"));
  assert.ok(problems.every((problem) => !problem.includes("example.invalid")));
});

test("the complete release supports token or OIDC Blob authentication", () => {
  assert.deepEqual(productionEnvironmentProblems(complete), []);
  assert.deepEqual(productionEnvironmentProblems({
    ...complete, BLOB_READ_WRITE_TOKEN: "", VERCEL_OIDC_TOKEN: "synthetic-oidc",
  }), []);
  assert.ok(productionEnvironmentProblems({ ...complete, BLOB_READ_WRITE_TOKEN: "" })
    .includes("BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN"));
});
