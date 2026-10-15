# Staging document-access evidence

When testing private Blob/document access, follow
`docs/deployment/signed-url-evidence.md` before collecting browser or CLI evidence.

- Never print signed URLs, query values, request/response headers, session cookies,
  private document bodies, or arbitrary fetch/error objects.
- Native accessibility snapshots can expose an embedded reader's signed source URL.
  Do not call native app snapshots/getAXState, dump DOM/network panels, save HAR/trace,
  or take screenshots of developer tools while signed authority is present.
- Keep signed URLs inside the authorized browser runtime. Do not paste them into
  tool arguments, shell commands, assertions, filenames, or environment dumps.
- Use `scripts/staging-evidence.mjs` at the evidence boundary, before any tool return,
  console write or artifact write. Return only its allowlisted status records.
  Masked URLs are for evidence only; send original URLs unchanged for retrieval.
- Do not treat a signed GET's authorized issuance or temporary cookie-free access
  as a logging defect. Do not change application auth/storage logic for transcript hygiene.
