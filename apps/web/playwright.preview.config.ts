import { defineConfig } from "@playwright/test";

// Runs the staging weekly cycle against an already deployed Vercel Preview: no local
// servers. PREVIEW_URL is the deployment origin; when Deployment Protection is on,
// VERCEL_AUTOMATION_BYPASS_SECRET is sent as Vercel's automation bypass header.
const previewUrl = process.env.PREVIEW_URL;
if (!previewUrl) throw new Error("PREVIEW_URL is required");
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

export default defineConfig({
  testDir: "./tests",
  testMatch: /staging-weekly-cycle\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 300000,
  expect: { timeout: 20000 },
  use: {
    baseURL: new URL(previewUrl).origin,
    // Preview credentials and signed authority must never enter trace artifacts.
    trace: "off",
    screenshot: "off",
    video: "off",
    extraHTTPHeaders: bypass
      ? {
          "x-vercel-protection-bypass": bypass,
          "x-vercel-set-bypass-cookie": "true",
        }
      : {},
  },
  projects: [
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { viewport: { width: 390, height: 844 } } },
  ],
});
