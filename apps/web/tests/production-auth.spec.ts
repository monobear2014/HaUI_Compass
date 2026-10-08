import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

test("production rejects known demo credentials and existing demo cookies while private accounts work", async ({
  request,
  baseURL,
}) => {
  // Seed the existing demonstration account through the explicitly enabled test server.
  expect(
    (
      await request.post("/api/auth/login", {
        headers: { Origin: baseURL! },
        data: { username: "demo", password: "haui123" },
      })
    ).status(),
  ).toBe(200);
  const port = Number(process.env.PLAYWRIGHT_WEB_PORT || 3000) + 120;
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn("npm", ["run", "start", "--", "--port", String(port)], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      NODE_ENV: "production",
      COMPASS_TEST_STORAGE: "1",
      COMPASS_DEMO_AUTH: "0",
    },
  });
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  const db = new DatabaseSync(".playwright-data/accounts.sqlite");
  try {
    await expect
      .poll(async () => {
        try {
          return (await request.get(origin)).status();
        } catch {
          return 0;
        }
      })
      .toBe(200);
    db.prepare("INSERT INTO sessions VALUES (?, 'student-demo', ?)").run(
      hash,
      Date.now() + 60000,
    );
    const existingCookie = await request.get(`${origin}/api/documents`, {
      headers: { Cookie: `compass_session=${token}` },
    });
    expect(existingCookie.status()).toBe(401);
    const login = await request.post(`${origin}/api/auth/login`, {
      headers: { Origin: origin },
      data: { username: "demo", password: "haui123" },
    });
    expect(login.status()).toBe(401);
    const registered = await request.post(`${origin}/api/auth/register`, {
      headers: { Origin: origin },
      data: {
        username: `prod_${crypto.randomUUID().slice(0, 12)}`,
        name: "Private student",
        password: "test123",
      },
    });
    expect(registered.status()).toBe(201);
    expect((await request.get(`${origin}/api/documents`)).status()).toBe(200);
  } finally {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash);
    db.close();
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  }
});
