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
  if (data.mode === "live_activity") {
    if (!data.simulated || !Number.isFinite(Date.parse(data.as_of)))
      throw new Error();
    for (const item of data.classes) {
      if (item.suppressed) {
        if (
          item.activity !== null ||
          item.enrollment_count !== null ||
          item.progress !== null ||
          item.comparison !== null
        )
          throw new Error();
      } else {
        if (item.enrollment_count < data.minimum_cohort) throw new Error();
        if (!item.progress || !item.comparison?.simulated) throw new Error();
        const progress = item.progress;
        if (JSON.stringify(progress) !== JSON.stringify(item.comparison.after))
          throw new Error();
        if (
          progress.due_obligations === 0
            ? progress.on_time_rate !== null
            : progress.on_time_rate !==
              Math.round(
                (progress.on_time_due / progress.due_obligations) * 1000,
              ) /
                10
        )
          throw new Error();
        const keys = [
          "completed_tasks",
          "learners_reflected",
          "learners_with_plan",
          "study_minutes",
          "tasks",
        ];
        if (
          JSON.stringify(Object.keys(item.activity).sort()) !==
          JSON.stringify(keys)
        )
          throw new Error();
        if (
          !Object.values(item.activity).every(
            (value) => Number.isInteger(value) && value >= 0,
          )
        )
          throw new Error();
      }
    }
  } else if (data.mode === "fixture") {
    if (
      !data.simulated ||
      Date.parse(data.as_of) !== Date.UTC(2026, 9, 18, 5) ||
      main?.progress?.on_time_rate !== 50 ||
      main.progress.due_obligations !== 12 ||
      main.progress.on_time_due !== 6 ||
      main.comparison?.before?.on_time_rate !== 25 ||
      main.comparison?.after?.on_time_rate !== 50 ||
      main.comparison?.change_percentage_points !== 25 ||
      small?.suppressed !== true ||
      small.progress !== null ||
      small.enrollment_count !== null ||
      small.comparison !== null
    )
      throw new Error();
  } else throw new Error();
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
