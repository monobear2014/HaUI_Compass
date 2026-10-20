import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { accessEvidence, probeDocumentAccess, redactEvidenceUrl } from "./staging-evidence.mjs";

const signed = "https://private.example.invalid/private.pdf?vercel-blob-delegation=SYNTHETIC_DELEGATION&vercel-blob-signature=SYNTHETIC_SIGNATURE&X-Amz-Credential=SYNTHETIC_CREDENTIAL&access_token=SYNTHETIC_ACCESS&unknown=SYNTHETIC_UNKNOWN#SYNTHETIC_FRAGMENT";

test("all authorization query values, unknown parameters, paths and fragments are masked", () => {
  const output = redactEvidenceUrl(signed);
  for (const key of ["vercel-blob-delegation", "vercel-blob-signature", "x-amz-credential", "access_token", "parameter"]) {
    assert.ok(output.includes(`${key}=[REDACTED]`));
  }
  assert.equal(output.includes("SYNTHETIC"), false);
  assert.equal(output.includes("private.pdf"), false);
  assert.equal(redactEvidenceUrl("malformed SYNTHETIC"), "[REDACTED_URL]");
  assert.equal(redactEvidenceUrl("data:text/plain,SYNTHETIC"), "[REDACTED_URL]");
  assert.equal(redactEvidenceUrl("https://user:password@example.invalid/?sig=a&SIG=b"),
    "https://[REDACTED_RESOURCE]/?sig=[REDACTED]&sig=[REDACTED]");
});

test("evidence preserves status and expiry while discarding cookies, bodies, URLs and arbitrary fields", () => {
  const evidence = accessEvidence({ status: 403, phase: "expired", resourceType: "pdf", elapsedMs: 311264,
    url: signed, headers: { authorization: "SYNTHETIC_AUTH", cookie: "SYNTHETIC_COOKIE" },
    body: "SYNTHETIC_PRIVATE_CONTENT", error: signed });
  assert.deepEqual(evidence, { status: 403, phase: "expired", resourceType: "pdf", elapsedMs: 311264,
    access: "denied", expiration: "denied-after-expiry" });
  assert.equal(JSON.stringify(evidence).includes("SYNTHETIC"), false);
  assert.equal(JSON.stringify(evidence).includes("https://"), false);
  assert.equal(accessEvidence({ status: 200 }).status, 200);
  assert.equal(accessEvidence({ status: 302 }).access, "unverified");
  assert.equal(accessEvidence({ status: 999, phase: signed, resourceType: signed, elapsedMs: signed }).status, null);
  assert.equal(JSON.stringify(accessEvidence({ phase: signed, resourceType: signed })).includes("SYNTHETIC"), false);
});

test("real HTTP retrieval keeps original signed authority and privacy unchanged; only sanitized evidence is persisted", async () => {
  let expired = false;
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    res.writeHead(!expired && req.url === "/document?sig=SYNTHETIC_SIGNATURE" ? 200 : 403,
      { "Set-Cookie": "SYNTHETIC_COOKIE", "Content-Type": "application/pdf" });
    res.end("SYNTHETIC_PRIVATE_BYTES");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/document`;
    const url = `${base}?sig=SYNTHETIC_SIGNATURE`;
    const allowed = await probeDocumentAccess({ url, phase: "authorized", resourceType: "pdf" });
    const denied = await probeDocumentAccess({ url: base, phase: "unsigned", resourceType: "pdf" });
    expired = true;
    const after = await probeDocumentAccess({ url, phase: "expired", resourceType: "pdf" });
    assert.equal(allowed.status, 200);
    assert.equal(allowed.access, "allowed");
    assert.equal(denied.status, 403);
    assert.equal(after.status, 403);
    assert.equal(after.expiration, "denied-after-expiry");
    assert.deepEqual(requests, ["/document?sig=SYNTHETIC_SIGNATURE", "/document", "/document?sig=SYNTHETIC_SIGNATURE"]);
    const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "haui-safe-evidence-"));
    try {
      const file = join(dir, "evidence.json");
      await writeFile(file, JSON.stringify([allowed, denied, after].map(accessEvidence)));
      const saved = await readFile(file, "utf8");
      assert.equal(/SYNTHETIC|https?:|signature|cookie|PRIVATE_BYTES/.test(saved), false);
    } finally { await rm(dir, { recursive: true }); }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test("transport failures and redirects never echo a URL or claim access denied by storage", async () => {
  const result = await probeDocumentAccess({ url: signed, phase: "expired", resourceType: "pdf" }, async (url, options) => {
    assert.equal(url, signed);
    assert.equal(options.credentials, "omit");
    assert.equal(options.redirect, "error");
    throw new Error(`SYNTHETIC_COOKIE ${url}`);
  });
  assert.equal(result.status, null);
  assert.equal(result.access, "unverified");
  assert.equal(result.expiration, "unverified");
  assert.equal(JSON.stringify(result).includes("SYNTHETIC"), false);
});
