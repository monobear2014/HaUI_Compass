import { defineConfig } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT || "3000";
const apiPort = process.env.PLAYWRIGHT_API_PORT || "8005";
const apiUrl = `http://127.0.0.1:${apiPort}`;
const webUrl = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: webUrl, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command: `uv run --extra dev uvicorn --app-dir tests support.compass_browser_api:app --host 127.0.0.1 --port ${apiPort}`,
      cwd: "../api",
      env: { COMPASS_SERVICE_KEY: "playwright-compass-service-key" },
      url: `${apiUrl}/api/v1/demo/context`,
      reuseExistingServer: false,
    },
    {
      command: process.env.PLAYWRIGHT_USE_BUILD
        ? `npm run start -- --port ${webPort}`
        : `npm run dev -- --port ${webPort}`,
      url: webUrl,
      env: {
        COMPASS_API_URL: apiUrl,
        COMPASS_TEST_STORAGE: "1",
        COMPASS_DEMO_AUTH: "1",
        COMPASS_SERVICE_KEY: "playwright-compass-service-key",
      },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
