import "server-only";
import { Pool } from "pg";
import { resolveWebDatabaseConfiguration } from "./web-database-config";

let pool: Pool | undefined;

export function webPostgresPool(): Pool {
  if (pool) return pool;
  const configuration = resolveWebDatabaseConfiguration(process.env);
  if (configuration.kind !== "postgres")
    throw new Error("PostgreSQL web persistence is not configured");

  pool = new Pool({
    connectionString: configuration.connectionString,
    // Keep each warm serverless instance's connection footprint small. Deployments
    // should use the managed provider's pooled connection endpoint where available.
    max: 2,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    keepAlive: true,
  });
  pool.on("error", () => {
    // Do not print driver errors here: connection details may contain credentials.
    console.error("Web PostgreSQL pool encountered an idle connection error");
  });
  return pool;
}
