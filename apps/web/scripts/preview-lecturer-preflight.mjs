// Read-only smoke for existing synthetic accounts. No trace, screenshots or bodies
// are logged. Supply credentials via an encrypted environment, never CLI arguments.
import { request } from "@playwright/test";
import { accessEvidence } from "../../../scripts/staging-evidence.mjs";

const contexts = [];
let check = "configuration";
try {
  const origin = new URL(process.env.PREVIEW_URL).origin;
  if (!origin.startsWith("https://") || !origin.endsWith(".vercel.app"))
    throw new Error();
  const accounts = ["STUDENT_A", "STUDENT_B", "LECTURER"];
  const users = [];
  for (const account of accounts) {
    check = `${account}:login`;
    const username = process.env[`${account}_USERNAME`];
    const password = process.env[`${account}_PASSWORD`];
    if (!username || !password) throw new Error();
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    const context = await request.newContext({
      baseURL: origin,
      extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass } : {},
    });
    contexts.push(context);
    const response = await context.post("/api/auth/login", {
      headers: { Origin: origin },
      data: { username, password },
      maxRedirects: 0,
    });
    if (response.status() !== 200) throw new Error();
    const data = await response.json();
    if (data.role !== (account === "LECTURER" ? "lecturer" : "student"))
      throw new Error();
    users.push(data.user.id);
    await response.dispose();
  }
  check = "distinct-accounts";
  if (new Set(users).size !== 3) throw new Error();
  async function probe(index, path, status, label) {
    check = label;
    const start = Date.now();
    const response = await contexts[index].get(path, { maxRedirects: 0 });
    const evidence = accessEvidence({
      status: response.status(),
      phase: status === 200 ? "authorized" : "foreign-owner",
      elapsedMs: Date.now() - start,
    });
    await response.dispose();
    console.log(JSON.stringify({ check: label, ...evidence }));
    if (evidence.status !== status) throw new Error();
  }
  for (const index of [0, 1]) {
    await probe(
      index,
      "/compass-api/demo/context",
      200,
      `student-${index}:workspace`,
    );
    await probe(
      index,
      "/compass-api/lecturer/classes",
      403,
      `student-${index}:role-denied`,
    );
    await probe(
      index,
      `/compass-api/demo/context?student_id=${encodeURIComponent(users[1 - index])}`,
      403,
      `student-${index}:foreign-owner-denied`,
    );
  }
  await probe(2, "/compass-api/lecturer/classes", 200, "lecturer:classes");
  await probe(
    2,
    "/compass-api/demo/context",
    403,
    "lecturer:student-route-denied",
  );
  await probe(
    2,
    "/compass-api/lecturer/classes/canvas-demo-other/progress",
    404,
    "lecturer:unassigned-class-denied",
  );
  check = "lecturer:aggregate-contract";
  const response = await contexts[2].get("/compass-api/lecturer/classes");
  const data = await response.json();
  await response.dispose();
  const main = data.classes.find((item) => item.class_id === "canvas-demo-ai");
  const small = data.classes.find(
    (item) => item.class_id === "canvas-demo-small",
  );
  if (
    !data.simulated ||
    Date.parse(data.as_of) !== Date.UTC(2026, 9, 18, 5) ||
    main?.progress?.on_time_rate !== 50 ||
    main.progress.due_obligations !== 12 ||
    main.progress.on_time_due !== 6 ||
    small?.suppressed !== true ||
    small.progress !== null ||
    small.enrollment_count !== null
  )
    throw new Error();
  console.log(JSON.stringify({ check, result: "PASS" }));
} catch {
  // Never print a Playwright error: it may contain auth headers or response bodies.
  console.log(JSON.stringify({ check, result: "BLOCKED" }));
  process.exitCode = 1;
} finally {
  await Promise.all(
    contexts.map((context) => context.dispose().catch(() => {})),
  );
}
