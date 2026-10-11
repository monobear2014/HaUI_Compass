import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../../../vercel.json", import.meta.url)));

test("Vercel Services config keeps web routes and API service separate", () => {
  assert.deepEqual(config.services.web.root, "apps/web");
  assert.equal(config.services.web.framework, "nextjs");
  assert.deepEqual(config.services.api.root, "apps/api");
  assert.equal(config.services.api.framework, "fastapi");
  assert.equal(config.services.api.entrypoint, "haui_compass.api.main:app");
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

test("staging functions have an explicit duration budget", () => {
  assert.equal(config.services.web.functions["src/app/api/**/*.ts"].maxDuration, 60);
  assert.equal(config.services.web.functions["src/app/compass-api/**/*.ts"].maxDuration, 60);
  assert.equal(config.services.api.functions["src/**/*.py"].maxDuration, 60);
});
