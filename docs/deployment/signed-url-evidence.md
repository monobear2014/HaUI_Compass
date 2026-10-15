# Collecting private document-access evidence

The exposure boundary was the browser automation tool return: native accessibility
snapshots included signed reader sources, and broad DevTools header filtering retained
partial upload credentials. Application signing and owner authorization remain unchanged.

## Collection procedure

1. Start from a safe application page in the authorized session. Do not attach a native
   app snapshot to a reader or DevTools view that already contains signed authority.
2. Use the automation runtime's supported page execution facility. Obtain the owned
   document's source **inside that page**; retain the original URL in page memory only.
   Do not return it to the agent or paste it into a subsequent tool call. Do not export
   cookies, headers, response bodies, HTML, accessibility snapshots, HAR or traces.
3. Run `probeDocumentAccess` from `scripts/staging-evidence.mjs` in that runtime and
   return only its result. The function is self-contained for page execution; load its
   source from the repository using the runtime's permitted facility. Do not interpolate
   the URL into executable source. Network requests retain the original URL and omit
   cookies, do not follow redirects, and discard response bodies. This probe is for Blob
   bearer checks, **not** authenticated app route checks.
4. `authorized` and `unsigned` probes capture initial access and unauthenticated storage
   denial. After the known lifetime, use the same in-memory URL with phase `expired`.
   Report initial/expired HTTP codes and elapsed time **between probes** separately from
   each probe's `elapsedMs` (request duration). HTTP 403 after expiry is an observed
   denial, not proof of the server's internal reason; compare with the prior 200.
5. For application authorization checks made through the existing authorized session,
   pass only `status`, `phase`, `resourceType`, and numeric `elapsedMs` to `accessEvidence`.
   That function drops every other field. Write/return only the resulting object.
6. If a masked URL is explicitly needed, `redactEvidenceUrl` removes host, path,
   userinfo, fragment, and **all** query values, including unknown parameters. Never
   send its output to fetch. Status evidence normally needs no URL at all.
7. Failed fetches return null status/unverified outcome; do not print the original
   error (it can embed a URL). Redirect/SSO responses are not application denial evidence.

Sanitize before a tool returns. Post-processing an already printed snapshot cannot
remove it from the agent transcript. These helpers do not intercept third-party tools;
the collection procedure and root `AGENTS.md` prevent bypassing that boundary.

## Regression checks

Run `node --test scripts/test-staging-evidence.mjs` from the repository root, or
`npm run test:config` in `apps/web` (includes these tests and private storage/auth checks).
Fixtures use reserved example hosts and a local HTTP server only. The HTTP test sends
an unchanged synthetic signed URL, observes 200/403/403, persists only sanitized evidence
in a disposable directory, and checks that it contains no URL, cookie or credential.
No cloud token, database, browser session, or model request is required.

Historical platform-managed transcripts are audit records. Retain references and
expiry/status summaries in the report; do not silently rewrite original transcripts,
Git history, or cloud logs to claim a zero-exposure run. Review retained logs through
the platform's normal retention controls if removal is needed.
