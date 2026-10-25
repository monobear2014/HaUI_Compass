import { pathToFileURL } from "node:url";

// The current web workspace uses the account-owned simulated Canvas API.
// A successful auth page/build alone does not prove the rest of the app is wired.
export function productionEnvironmentProblems(environment) {
  if (environment.VERCEL_ENV !== "production") return [];
  const required = [
    "HAUI_COMPASS_WEB_DATABASE_URL",
    "HAUI_COMPASS_DATABASE_URL",
    "COMPASS_WEB_ORIGIN",
    "COMPASS_SERVICE_KEY",
    "BLOB_STORE_ID",
    "BLOB_WEBHOOK_PUBLIC_KEY",
    "OPENAI_API_KEY",
    "HAUI_COMPASS_LLM_MODEL",
  ];
  const problems = required.filter((name) => !environment[name]?.trim());
  if (environment.HAUI_COMPASS_SIMULATED_WORKSPACES !== "1")
    problems.push("HAUI_COMPASS_SIMULATED_WORKSPACES=1");
  if (!/^(1|true|yes|on)$/i.test(environment.HAUI_COMPASS_LLM_ENABLED?.trim() || ""))
    problems.push("HAUI_COMPASS_LLM_ENABLED=true");
  if (!environment.BLOB_READ_WRITE_TOKEN?.trim() && !environment.VERCEL_OIDC_TOKEN?.trim())
    problems.push("BLOB_READ_WRITE_TOKEN or VERCEL_OIDC_TOKEN");
  return problems;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = productionEnvironmentProblems(process.env);
  if (problems.length) {
    // Names only: never include values, connection strings or provider errors.
    console.error(`Production configuration incomplete: ${problems.join(", ")}`);
    process.exitCode = 1;
  }
}
