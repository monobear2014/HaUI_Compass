import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../../../vercel.json", import.meta.url)));

test("Vercel Services config keeps web routes and API service separate", () => {
  assert.deepEqual(config.services.web.root, "apps/web");
  assert.equal(config.services.web.framework, "nextjs");
  assert.deepEqual(config.services.api.root, "apps/api");
  assert.equal(config.services.api.framework, "fastapi");
  assert.equal(config.services.api.entrypoint, "src/haui_compass/api/main.py");
  assert.deepEqual(config.services.web.bindings, [
    {
      type: "service",
      service: "api",
      format: "url",
      env: "COMPASS_API_URL",
    },
  ]);
  assert.deepEqual(config.rewrites, [
    {
      source: "/api/v1/health",
      destination: { service: "api" },
    },
  ]);
});

test("FastAPI service entrypoint is a file under its service root", async () => {
  const apiRoot = resolve(new URL("../../../apps/api", import.meta.url).pathname);
  await assert.doesNotReject(access(resolve(apiRoot, config.services.api.entrypoint)));
  assert.equal(config.services.api.functions["src/**/*.py"].maxDuration, 60);
});

test("public routing exposes only health and leaves Next.js API ownership intact", () => {
  assert.deepEqual(config.rewrites, [
    { source: "/api/v1/health", destination: { service: "api" } },
  ]);
  assert.ok(!config.rewrites.some(({ source }) => source === "/api/(.*)"));
  assert.ok(!config.rewrites.some(({ source }) => source === "/(.*)"));
});

test("staging functions have an explicit duration budget", () => {
  assert.equal(config.services.web.functions["src/app/api/**/*.ts"].maxDuration, 60);
  assert.equal(config.services.web.functions["src/app/compass-api/**/*.ts"].maxDuration, 60);
  assert.equal(config.services.api.functions["src/**/*.py"].maxDuration, 60);
});
