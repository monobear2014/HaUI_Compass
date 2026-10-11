export type WebDatabaseEnvironment = {
  HAUI_COMPASS_WEB_DATABASE_URL?: string;
  NODE_ENV?: string;
  VERCEL?: string;
};

export type WebDatabaseConfiguration =
  | { kind: "postgres"; connectionString: string }
  | { kind: "sqlite" };

export function resolveWebDatabaseConfiguration(
  environment: WebDatabaseEnvironment,
): WebDatabaseConfiguration {
  const connectionString = environment.HAUI_COMPASS_WEB_DATABASE_URL?.trim();
  if (connectionString) return { kind: "postgres", connectionString };

  if (environment.NODE_ENV === "production" || environment.VERCEL === "1")
    throw new Error("HAUI_COMPASS_WEB_DATABASE_URL is required in staging/production");

  return { kind: "sqlite" };
}
