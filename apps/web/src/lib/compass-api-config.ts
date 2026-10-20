export type CompassApiEnvironment = {
  COMPASS_API_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
};

function requiresConfiguredApi(environment: CompassApiEnvironment) {
  return environment.NODE_ENV === "production" || environment.VERCEL === "1";
}

export function resolveCompassApiUrl(
  environment: CompassApiEnvironment = process.env,
) {
  const configured = environment.COMPASS_API_URL?.trim();
  if (configured) {
    let parsed: URL;
    try {
      parsed = new URL(configured);
    } catch {
      throw new Error("COMPASS_API_URL must be an absolute HTTP(S) URL");
    }
    if (!/^https?:$/.test(parsed.protocol))
      throw new Error("COMPASS_API_URL must be an absolute HTTP(S) URL");
    return parsed.toString();
  }
  if (requiresConfiguredApi(environment))
    throw new Error("COMPASS_API_URL is required in staging/production");
  return "http://127.0.0.1:8000";
}

// The learning API decodes exactly these as JSON (case-insensitive, any parameters);
// the proxy forwards no other request body.
export function isJsonMediaType(contentType: string | null | undefined) {
  const essence = contentType?.split(";")[0].trim().toLowerCase() ?? "";
  return /^application\/([!#$&^_.+\w-]+\+)?json$/.test(essence);
}
