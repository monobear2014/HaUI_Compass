import "server-only";

// Provision by immutable account ID on both web and API servers. Registration
// cannot grant roles; client role fields and usernames are never consulted.
export function isLecturer(accountId: string): boolean {
  try {
    const grants: unknown = JSON.parse(
      process.env.COMPASS_LECTURER_GRANTS || "{}",
    );
    if (!grants || typeof grants !== "object" || Array.isArray(grants))
      return false;
    const classes = (grants as Record<string, unknown>)[accountId];
    return (
      Array.isArray(classes) &&
      classes.every((value) => typeof value === "string")
    );
  } catch {
    return false;
  }
}
