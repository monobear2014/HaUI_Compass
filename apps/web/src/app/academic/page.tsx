"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { api, apiDelete, Assignment, date, label, minutes } from "@/lib/api";
import { useWorkspace } from "@/components/workspace";
import Link from "next/link";
import { usePreferences } from "@/components/preferences";
import { PageHeading } from "@/components/ui";
import { Icon } from "@/components/icons";

type Source = "manual" | "csv" | "json";
type Academic = {
  source: Source;
  courses: number;
  assignments: number;
  submissions: number;
  courses_data: { external_id: string; name: string; code: string | null }[];
  assignments_data: {
    external_id: string;
    course_external_id: string;
    title: string;
    deadline: string | null;
    estimated_effort_minutes: number | null;
  }[];
  submissions_data: { assignment_external_id: string; status: string }[];
};
type DecompositionCandidate = {
  id: string;
  title: string;
  estimated_duration_minutes: number;
  rationale: string | null;
  source: "ai" | "demo_fallback";
};
type Decomposition = {
  session_id: string;
  assignment_title: string;
  source: "ai" | "demo_fallback";
  fallback_reason: string | null;
  candidates: DecompositionCandidate[];
};
const student = "pilot-student";
const version = "haui-compass-academic-import-v1";

export default function AcademicPage() {
  const { context, refresh } = useWorkspace();
  const { t, language } = usePreferences();
  const [source, setSource] = useState<Source>("manual");
  const [data, setData] = useState<Academic | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [course, setCourse] = useState("");
  const [code, setCode] = useState("");
  const [assignment, setAssignment] = useState("");
  const [deadline, setDeadline] = useState("");
  const [effort, setEffort] = useState("60");
  const [importMode, setImportMode] = useState<"manual" | "file">("manual");
  const importDrawer = useRef<HTMLDetailsElement>(null);

  const load = useCallback(
    async (selected = source) => {
      try {
        setError("");
        setData(
          await api<Academic>(
            `academic-data?source=${selected}&student_external_id=${student}`,
          ),
        );
      } catch (err) {
        setData(null);
        if ((err as { status?: number }).status !== 404) setError(String(err));
      }
    },
    [source],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function importManual(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const courseId = course
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-");
      const assignmentId = assignment
        .trim()
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-");
      await api("academic-data/import", {
        schema_version: version,
        student_external_id: student,
        source: "manual",
        courses: [{ external_id: courseId, name: course, code: code || null }],
        assignments: [
          {
            external_id: assignmentId,
            course_external_id: courseId,
            title: assignment,
            deadline: new Date(deadline).toISOString(),
            estimated_effort_minutes: Number(effort),
          },
        ],
        submissions: [],
      });
      setNotice(t("academic.manualImported"));
      window.localStorage.setItem("haui-compass-academic-source", "manual");
      window.dispatchEvent(new Event("academic-data-changed"));
      await load("manual");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not import academic data.",
      );
    }
  }
  async function importFile() {
    if (!file) return;
    setError("");
    try {
      const content = await file.text();
      if (file.name.endsWith(".csv")) {
        await api("academic-data/import/csv", {
          student_external_id: student,
          content,
        });
        setSource("csv");
        window.localStorage.setItem("haui-compass-academic-source", "csv");
        await load("csv");
      } else if (file.name.endsWith(".json")) {
        await api("academic-data/import", JSON.parse(content));
        setSource("json");
        window.localStorage.setItem("haui-compass-academic-source", "json");
        await load("json");
      } else {
        throw new Error("Choose a .csv or .json academic-data file.");
      }
      setNotice(`${t("academic.fileImported")} (${file.name})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import file.");
    }
  }
  async function createTask(
    item: Academic["assignments_data"][number],
    title: string,
    estimatedEffortMinutes: number,
  ) {
    try {
      await api("tasks", {
        student: { provider: source, id: student },
        assignment: { provider: source, id: item.external_id },
        task_id: crypto.randomUUID(),
        title,
        estimated_effort_minutes: estimatedEffortMinutes,
      });
      setNotice(t("academic.taskCreated"));
      window.dispatchEvent(new Event("academic-data-changed"));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create study task.",
      );
    }
  }
  return (
    <>
      <PageHeading
        title={t("academic.title")}
        description={t("academic.description")}
        action={
          <button
            className="primary"
            onClick={() => {
              if (importDrawer.current) {
                importDrawer.current.open = true;
                importDrawer.current.scrollIntoView({ block: "start" });
              }
            }}
          >
            <Icon name="plus" size={16} />
            {language === "vi" ? "Thêm bài tập" : "Add assignment"}
          </button>
        }
      />
      {context?.scenario_id && (
        <section className="panel academic-current">
          <div className="section-heading">
            <h2>{t("academic.academicToTasks")}</h2>
            <span className="badge">{t("common.demo")}</span>
          </div>
          <ul className="academic-list">
            {context.assignments?.map((assignment) => {
              const tasks = context.tasks.filter(
                (task) => task.assignment_id === assignment.assignment_id,
              );
              return (
                <li key={assignment.external_id} className="assignment-card">
                  <div>
                    <strong>
                      {assignment.course} / {assignment.title}
                    </strong>
                    <span>
                      {t("academic.deadline")}:{" "}
                      {date(assignment.deadline, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {tasks.length ? (
                      <details className="assignment-steps">
                        <summary>
                          {tasks.length}{" "}
                          {language === "vi" ? "công việc" : "study tasks"}
                        </summary>
                        {tasks.map((task) => (
                          <span key={task.id}>
                            {t("common.task")}: {task.title} ·{" "}
                            {minutes(task.estimated_duration_seconds)} min ·{" "}
                            {label(task.status, language)}
                          </span>
                        ))}
                      </details>
                    ) : (
                      <span>{t("academic.noConfirmedTasks")}</span>
                    )}
                  </div>
                  <TaskDecomposition
                    assignment={assignment}
                    student={context.student}
                    onConfirmed={refresh}
                  />
                </li>
              );
            })}
          </ul>
          <Link className="text-link" href="/today">
            {t("academic.todayLink")}
          </Link>
        </section>
      )}
      <details className="panel import-drawer" ref={importDrawer}>
        <summary>
          {language === "vi"
            ? "Thêm môn học & bài tập"
            : "Add courses & assignments"}
          <Icon name="plus" size={16} />
        </summary>
        <div
          className="scope-tabs import-tabs"
          role="group"
          aria-label={
            language === "vi" ? "Cách thêm bài tập" : "Assignment entry method"
          }
        >
          <button
            type="button"
            className={importMode === "manual" ? "active" : "secondary"}
            aria-pressed={importMode === "manual"}
            onClick={() => setImportMode("manual")}
          >
            {t("academic.manual")}
          </button>
          <button
            type="button"
            className={importMode === "file" ? "active" : "secondary"}
            aria-pressed={importMode === "file"}
            onClick={() => setImportMode("file")}
          >
            {t("academic.fileImport")}
          </button>
        </div>
        <div className="academic-grid">
          <section hidden={importMode !== "manual"}>
            <h2>{t("academic.manual")}</h2>
            <form className="form-stack" onSubmit={importManual}>
              <label>
                {t("academic.courseName")}
                <input
                  required
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                />
              </label>
              <label>
                {t("academic.courseCode")}{" "}
                <input value={code} onChange={(e) => setCode(e.target.value)} />
              </label>
              <label>
                {t("academic.assignmentTitle")}
                <input
                  required
                  value={assignment}
                  onChange={(e) => setAssignment(e.target.value)}
                />
              </label>
              <label>
                {t("academic.deviceDeadline")}
                <input
                  required
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
              <label>
                {t("academic.estimate")}
                <input
                  required
                  min="1"
                  type="number"
                  value={effort}
                  onChange={(e) => setEffort(e.target.value)}
                />
              </label>
              <p className="fine-print">{t("academic.estimateHint")}</p>
              <button className="primary">{t("academic.importManual")}</button>
            </form>
          </section>
          <section hidden={importMode !== "file"}>
            <h2>{t("academic.fileImport")}</h2>
            <p>{t("academic.fileHint")}</p>
            <input
              aria-label={t("academic.fileLabel")}
              type="file"
              accept=".csv,.json,application/json,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file && (
              <p className="fine-print">
                {t("academic.selected")}: {file.name}
              </p>
            )}
            <button
              className="primary"
              disabled={!file}
              onClick={() => void importFile()}
            >
              {t("academic.validateImport")}
            </button>
            <p className="fine-print">{t("academic.serverValidates")}</p>
          </section>
        </div>
      </details>
      <section className="panel academic-current">
        <div className="section-heading">
          <h2>{t("academic.importedData")}</h2>
          <select
            value={source}
            onChange={(e) => {
              const next = e.target.value as Source;
              setSource(next);
            }}
          >
            <option value="manual">{t("academic.sourceManual")}</option>
            <option value="csv">{t("academic.sourceCsv")}</option>
            <option value="json">{t("academic.sourceJson")}</option>
          </select>
        </div>
        <button className="secondary small" onClick={() => void load()}>
          {t("common.refresh")}
        </button>
        {notice && <p className="form-success">{notice}</p>}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {data ? (
          <>
            <details className="compact-disclosure">
              <summary>{t("academic.provenance")}</summary>
              <p className="fine-print">
                {t("academic.provenance")}: {data.source.toUpperCase()} ·{" "}
                {data.courses} {t("academic.courses")} · {data.assignments}{" "}
                {t("academic.assignments")} · {data.submissions}{" "}
                {t("academic.submissions")}
              </p>
              <p className="fine-print">
                {language === "vi"
                  ? "Dữ liệu do bạn cung cấp, không phải dữ liệu HaUI chính thức."
                  : "student-provided pilot data, never official HaUI data"}
              </p>
            </details>
            <ul className="academic-list">
              {data.assignments_data.map((item) => (
                <li key={item.external_id}>
                  <div>
                    <strong>{item.title}</strong>
                    <span>
                      {item.course_external_id} ·{" "}
                      {item.deadline
                        ? new Date(item.deadline).toLocaleString()
                        : t("common.noDeadline")}
                    </span>
                  </div>
                  <CreateTask item={item} onCreate={createTask} />
                </li>
              ))}
            </ul>
            <details className="compact-disclosure">
              <summary>
                {language === "vi"
                  ? "Quản lý dữ liệu đã nhập"
                  : "Manage imported data"}
              </summary>
              <button
                className="text-link"
                onClick={async () => {
                  await apiDelete(
                    `academic-data?source=${source}&student_external_id=${student}`,
                  );
                  setData(null);
                  setNotice(t("academic.dataCleared"));
                }}
              >
                {t("academic.clearSource")}
              </button>
            </details>
          </>
        ) : (
          <p className="fine-print">{t("academic.noImported")}</p>
        )}
      </section>
    </>
  );
}

function TaskDecomposition({
  assignment,
  student,
  onConfirmed,
}: {
  assignment: Assignment;
  student: { provider: string; id: string };
  onConfirmed: () => Promise<void>;
}) {
  const { t } = usePreferences();
  const [session, setSession] = useState<Decomposition | null>(null);
  const [drafts, setDrafts] = useState<DecompositionCandidate[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<string[]>([]);

  async function suggest() {
    setBusy(true);
    setError("");
    setCreated([]);
    try {
      const result = await api<Decomposition>("task-decompositions", {
        session_id: crypto.randomUUID(),
        student,
        assignment: {
          provider: assignment.provider,
          id: assignment.external_id,
        },
      });
      setSession(result);
      setDrafts(result.candidates);
      setSelected(result.candidates.map((candidate) => candidate.id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not suggest study tasks.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        created_tasks: { id: string; title: string }[];
      }>(`task-decompositions/${session.session_id}/confirm`, {
        student,
        selection: drafts
          .filter((candidate) => selected.includes(candidate.id))
          .map((candidate) => ({
            candidate_id: candidate.id,
            title: candidate.title,
            estimated_duration_minutes: candidate.estimated_duration_minutes,
          })),
      });
      setCreated(result.created_tasks.map((task) => task.title));
      await onConfirmed();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not add selected tasks.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <div className="decomposition-actions">
        <button
          className="secondary small"
          disabled={busy}
          onClick={() => void suggest()}
        >
          {busy ? t("academic.suggesting") : t("academic.suggest")}
        </button>
        {error && <span className="form-error">{error}</span>}
      </div>
    );
  }

  return (
    <section
      className="decomposition-review"
      aria-label={`Task suggestions for ${assignment.title}`}
    >
      <div className="section-heading">
        <strong>{t("academic.candidates")}</strong>
        <span className="badge">
          {session.source === "ai"
            ? t("academic.online")
            : t("academic.offline")}
        </span>
      </div>
      <p className="fine-print">{t("academic.suggestionsHint")}</p>
      {drafts.map((candidate, index) => (
        <div className="decomposition-candidate" key={candidate.id}>
          <label className="choice">
            <input
              type="checkbox"
              aria-label={`Select ${candidate.title}`}
              checked={selected.includes(candidate.id)}
              disabled={created.length > 0}
              onChange={(event) =>
                setSelected((current) =>
                  event.target.checked
                    ? [...current, candidate.id]
                    : current.filter((id) => id !== candidate.id),
                )
              }
            />
            {t("academic.include")}
          </label>
          <label>
            {t("academic.suggestedTitle")}
            <input
              aria-label={`Candidate ${index + 1} title`}
              value={candidate.title}
              minLength={3}
              maxLength={120}
              disabled={created.length > 0}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((row) =>
                    row.id === candidate.id
                      ? { ...row, title: event.target.value }
                      : row,
                  ),
                )
              }
            />
          </label>
          <label>
            {t("academic.suggestedEstimate")}
            <input
              aria-label={`Candidate ${index + 1} estimate`}
              type="number"
              min={15}
              max={480}
              value={candidate.estimated_duration_minutes}
              disabled={created.length > 0}
              onChange={(event) =>
                setDrafts((current) =>
                  current.map((row) =>
                    row.id === candidate.id
                      ? {
                          ...row,
                          estimated_duration_minutes: Number(
                            event.target.value,
                          ),
                        }
                      : row,
                  ),
                )
              }
            />
          </label>
          {candidate.rationale && (
            <details className="compact-disclosure">
              <summary>{t("today.explanation")}</summary>
              <p>{candidate.rationale}</p>
            </details>
          )}
        </div>
      ))}
      {created.length ? (
        <p className="form-success" role="status">
          Added {created.length} confirmed tasks: {created.join("; ")}
        </p>
      ) : (
        <button
          className="primary"
          disabled={busy || selected.length === 0}
          onClick={() => void confirm()}
        >
          {busy ? t("academic.addingSelected") : t("academic.addSelected")}
        </button>
      )}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}

function CreateTask({
  item,
  onCreate,
}: {
  item: Academic["assignments_data"][number];
  onCreate: (
    item: Academic["assignments_data"][number],
    title: string,
    estimatedEffortMinutes: number,
  ) => Promise<void>;
}) {
  const { t } = usePreferences();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(`Work on ${item.title}`);
  const [effort, setEffort] = useState(
    String(item.estimated_effort_minutes || 60),
  );
  if (!editing) {
    return (
      <button className="secondary small" onClick={() => setEditing(true)}>
        {t("academic.createTask")}
      </button>
    );
  }
  return (
    <form
      className="form-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void onCreate(item, title, Number(effort));
      }}
    >
      <label>
        {t("academic.studyTaskTitle")}
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        {t("academic.studyTaskEstimate")}
        <input
          required
          min="1"
          type="number"
          value={effort}
          onChange={(event) => setEffort(event.target.value)}
        />
      </label>
      <button className="secondary small">{t("academic.saveTask")}</button>
      <button
        className="text-link"
        type="button"
        onClick={() => setEditing(false)}
      >
        {t("academic.cancel")}
      </button>
    </form>
  );
}
