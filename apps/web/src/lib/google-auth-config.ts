type GoogleEnvironment = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  NODE_ENV?: string;
};

export function isGoogleAuthOrigin(request: Request, origin: string) {
  const url = new URL(request.url);
  const configured = new URL(origin);
  // Next dev can normalize Request.url to localhost while Host still carries
  // the browser's 127.0.0.1. Do not trust forwarded-host or forwarded-proto.
  return (
    url.protocol === configured.protocol &&
    (request.headers.get("host") || url.host) === configured.host
  );
}

export function googleAuthConfiguration(
  environment: GoogleEnvironment = process.env,
) {
  const clientId = environment.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = environment.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = environment.GOOGLE_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    const local =
      environment.NODE_ENV !== "production" &&
      ["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.protocol === "http:";
    if (
      (url.protocol !== "https:" && !local) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/api/auth/google/callback"
    )
      return null;
    return {
      clientId,
      clientSecret,
      redirectUri: url.href,
      origin: url.origin,
    };
  } catch {
    return null;
  }
}
