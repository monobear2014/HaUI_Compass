export function safeReturnPath(value: unknown) {
  if (typeof value !== "string") return "/learn";
  try {
    const url = new URL(value, "http://compass.local");
    if (
      url.origin === "http://compass.local" &&
      ([
        "/learn",
        "/today",
        "/plan",
        "/academic",
        "/knowledge",
        "/reflect",
        "/history",
        "/dashboard",
      ].includes(url.pathname) ||
        /^\/(documents|study-set)\/[a-f0-9-]{36}$/.test(url.pathname))
    )
      return url.pathname + url.search;
  } catch {
    /* Fall back to the student home. */
  }
  return "/learn";
}
