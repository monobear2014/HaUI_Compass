import { defineConfig } from "@playwright/test";
import preview from "./playwright.preview.config";

const origin = new URL(process.env.PREVIEW_URL!);
process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
if (origin.protocol !== "https:" || !origin.hostname.endsWith(".vercel.app"))
  throw new Error("A Vercel Preview origin is required");

export default defineConfig({
  ...preview,
  testMatch: /(staging-weekly-cycle|preview-lecturer)\.spec\.ts/,
  reporter: [["./tests/support/release-reporter.ts"]],
  timeout: 420000,
  preserveOutput: "never",
  use: {
    ...preview.use,
    actionTimeout: 30000,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
