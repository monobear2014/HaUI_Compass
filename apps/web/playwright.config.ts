import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: [
    {
      command:
        "uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001",
      cwd: "../api",
      url: "http://127.0.0.1:8001/api/v1/demo/context",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev",
      url: "http://127.0.0.1:3000",
      env: { COMPASS_API_URL: "http://127.0.0.1:8001" },
      reuseExistingServer: !process.env.CI,
    },
  ],
});
