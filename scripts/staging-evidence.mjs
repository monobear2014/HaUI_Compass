/** Evidence boundary only. Never pass raw snapshots, headers, bodies or errors to a logger. */

/** Mask every query value, including unknown providers' authorization parameters.
 * Drop host, path, userinfo and fragment too: document names/IDs can be private.
 * This is for evidence, never for a network request.
 */
export function redactEvidenceUrl(input) {
  try {
    const url = new URL(input);
    if (!["https:", "http:"].includes(url.protocol)) return "[REDACTED_URL]";
    const knownKeys = /^(?:vercel-blob-[a-z-]+|x-amz-[a-z-]+|x-goog-[a-z-]+|token|sig|signature|authorization|expires|se|sp|sv|credential|key|access_token)$/i;
    const query = [...url.searchParams.keys()].map((key) =>
      `${knownKeys.test(key) ? key.toLowerCase() : "parameter"}=[REDACTED]`,
    ).join("&");
    return `${url.protocol}//[REDACTED_RESOURCE]/${query ? `?${query}` : ""}`;
  } catch {
    return "[REDACTED_URL]";
  }
}

/** Strict allowlist: do not spread input or stringify arbitrary errors/headers. */
export function accessEvidence(input) {
  const phases = ["authorized", "unsigned", "expired", "anonymous", "foreign-owner"];
  const types = ["pdf", "text", "markdown", "blob"];
  const status = Number.isInteger(input.status) && input.status >= 100 && input.status <= 599
    ? input.status : null;
  return {
    phase: phases.includes(input.phase) ? input.phase : "unknown",
    resourceType: types.includes(input.resourceType) ? input.resourceType : "unknown",
    status,
    access: status !== null && status >= 200 && status < 300 ? "allowed"
      : status === 401 || status === 403 || status === 404 ? "denied" : "unverified",
    elapsedMs: Number.isSafeInteger(input.elapsedMs) && input.elapsedMs >= 0
      ? input.elapsedMs : null,
    expiration: input.phase === "expired" && status === 403 ? "denied-after-expiry" : "unverified",
  };
}

/** Keep original authority exclusively in memory. Response body is never read.
 * Browser usage: evaluate this function in the authorized page realm; return only
 * its result. It is self-contained so it can be passed to page.evaluate directly.
 */
export async function probeDocumentAccess(input, fetcher = globalThis.fetch) {
  const start = Date.now();
  let status = null;
  try {
    const response = await fetcher(input.url, {
      credentials: "omit", cache: "no-store", redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    status = response.status;
    await response.body?.cancel();
  } catch {
    // Fetch errors can embed the signed URL. Do not return/print their message.
  }
  return {
    phase: ["authorized", "unsigned", "expired"].includes(input.phase) ? input.phase : "unknown",
    resourceType: ["pdf", "text", "markdown", "blob"].includes(input.resourceType) ? input.resourceType : "unknown",
    status,
    access: status !== null && status >= 200 && status < 300 ? "allowed"
      : status === 401 || status === 403 || status === 404 ? "denied" : "unverified",
    elapsedMs: Date.now() - start,
    expiration: input.phase === "expired" && status === 403 ? "denied-after-expiry" : "unverified",
  };
}
