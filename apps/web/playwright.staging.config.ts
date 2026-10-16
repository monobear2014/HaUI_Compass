import { defineConfig } from "@playwright/test";

// Staging-equivalent local stack: production Next.js build + FastAPI `main:app` with
// per-account simulated workspaces, both on PostgreSQL (web schema `web`, API schema
// `public`), real registration/login and the shared service key. Requires
// STAGING_E2E_DATABASE_URL (a disposable database) and a prior `npm run build`.
const webPort = process.env.PLAYWRIGHT_WEB_PORT || "3200";
const apiPort = process.env.PLAYWRIGHT_API_PORT || "8205";
const webUrl = `http://127.0.0.1:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const database = process.env.STAGING_E2E_DATABASE_URL || "";
const serviceKey = "staging-e2e-service-key";

export default defineConfig({
  testDir: "./tests",
  testMatch: /staging-weekly-cycle\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 180000,
  use: { baseURL: webUrl, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: `.venv/bin/uvicorn haui_compass.api.main:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: "../api",
      env: {
        HAUI_COMPASS_SIMULATED_WORKSPACES: "1",
        HAUI_COMPASS_DATABASE_URL: database.replace(
          /^postgres(ql)?:\/\//,
          "postgresql+psycopg://",
        ),
        COMPASS_SERVICE_KEY: serviceKey,
        HAUI_COMPASS_LLM_ENABLED: "false",
      },
      url: `${apiUrl}/api/v1/health`,
      reuseExistingServer: false,
    },
    {
      command: `npm run start -- --port ${webPort}`,
      url: webUrl,
      env: {
        NODE_ENV: "production",
        COMPASS_API_URL: apiUrl,
        COMPASS_SERVICE_KEY: serviceKey,
        HAUI_COMPASS_WEB_DATABASE_URL: database,
        // Document upload is not part of this flow; a placeholder satisfies the
        // fail-closed storage check without contacting Vercel Blob.
        BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_e2e_placeholder_not_used",
      },
      reuseExistingServer: false,
    },
  ],
});
