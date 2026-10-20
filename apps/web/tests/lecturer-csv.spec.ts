import { test, expect } from "@playwright/test";
import {
  lecturerCsv,
  type AssignmentInsight,
} from "../src/lib/lecturer-insights";

test("CSV escapes aggregate labels and neutralizes spreadsheet formulas", () => {
  const row: AssignmentInsight = {
    key: "a1",
    title: '=HYPERLINK("x")',
    course: "Databases, lab",
    deadline_start: null,
    deadline_end: null,
    due_soon: 0,
    tasks: 1,
    completed_tasks: 0,
    study_minutes: 0,
    progress: {
      on_time: 0,
      late: 0,
      not_submitted: 0,
      not_yet_due: 1,
      no_deadline: 0,
      due_obligations: 0,
      on_time_due: 0,
      on_time_rate: null,
    },
  };
  const csv = lecturerCsv("Class", "2026-10-19T00:00:00Z", [row]);
  expect(csv).toContain('"Databases, lab"');
  expect(csv).toContain('"\'=HYPERLINK(""x"")"');
  expect(csv).not.toContain("undefined");
  expect(csv).not.toContain("a1");
});
