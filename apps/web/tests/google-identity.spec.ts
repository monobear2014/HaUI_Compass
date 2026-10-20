import { test, expect } from "@playwright/test";
import Module, { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Google subjects persist as separate users and use the normal revocable session", async () => {
  const directory = mkdtempSync(join(tmpdir(), "compass-oauth-test-"));
  const original = {
    COMPASS_STORAGE_DIR: process.env.COMPASS_STORAGE_DIR,
    COMPASS_TEST_STORAGE: process.env.COMPASS_TEST_STORAGE,
    HAUI_COMPASS_WEB_DATABASE_URL: process.env.HAUI_COMPASS_WEB_DATABASE_URL,
  };
  process.env.COMPASS_STORAGE_DIR = directory;
  process.env.COMPASS_TEST_STORAGE = "1";
  delete process.env.HAUI_COMPASS_WEB_DATABASE_URL;
  // This test runner is a Node server process. Replace only Next's import
  // marker so the actual server persistence/session implementation can run.
  const require = createRequire(__filename);
  const marker = require.resolve("next/dist/compiled/server-only/empty.js");
  const loader = Module as unknown as {
    _resolveFilename: (request: string, ...args: unknown[]) => string;
  };
  const resolve = loader._resolveFilename;
  loader._resolveFilename = function (request, ...args) {
    return request === "server-only"
      ? marker
      : resolve.call(this, request, ...args);
  };
  try {
    const auth = await import("../src/lib/demo-auth");
    const passwordUser = await auth.registerUser(
      "synthetic_password",
      "Synthetic123",
      "Same display name",
    );
    const first = await auth.getOrCreateGoogleUser(
      "synthetic-google-a",
      "Same display name",
    );
    const again = await auth.getOrCreateGoogleUser(
      "synthetic-google-a",
      "Changed name",
    );
    const other = await auth.getOrCreateGoogleUser(
      "synthetic-google-b",
      "Same display name",
    );
    expect(again.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
    expect(first.id).not.toBe(passwordUser.id);
    await expect(
      auth.authenticate(first.username, "Synthetic123"),
    ).rejects.toMatchObject({ code: "invalid_credentials" });
    const session = await auth.createSession(first);
    expect(await auth.getSessionUser(session)).toEqual(first);
    await auth.revokeSession(session);
    expect(await auth.getSessionUser(session)).toBeNull();
    expect((await auth.accountDetails(first)).login_method).toBe("google");
    await expect(
      auth.changeAccountPassword(first, "unused-current", "UnusedNew123"),
    ).rejects.toMatchObject({ code: "google_managed" });
    await auth.updateAccountProfile(first, "Updated Google name", {
      birth_date: "2003-07-15",
      major: "AI",
      bio: "Synthetic profile",
    });
    const reloaded = await auth.getOrCreateGoogleUser(
      "synthetic-google-a",
      "Provider display name",
    );
    expect(reloaded.name).toBe("Updated Google name");
    expect((await auth.accountDetails(reloaded)).profile.birth_date).toBe(
      "2003-07-15",
    );
  } finally {
    loader._resolveFilename = resolve;
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
