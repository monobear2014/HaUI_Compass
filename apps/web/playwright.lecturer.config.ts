import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Separate invocation: the existing synthetic account is a lecturer only here.
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: /lecturer\.spec\.ts/,
  webServer: (Array.isArray(base.webServer) ? base.webServer : []).map(
    (server) => ({
      ...server,
      reuseExistingServer: false,
      env: {
        ...server.env,
        COMPASS_LECTURER_GRANTS:
          '{"student-demo":["canvas-demo-ai","canvas-demo-small"]}',
      },
    }),
  ),
});
