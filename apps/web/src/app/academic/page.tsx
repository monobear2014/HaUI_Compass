"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ACADEMIC_SOURCE_KEY,
  ACADEMIC_STUDENT_KEY,
  academicStudentId,
  api,
  apiDelete,
  date,
  label,
  minutes,
  SIMULATED_MODE,
} from "@/lib/api";
import { useWorkspace } from "@/components/workspace";
import Link from "next/link";
import { usePreferences } from "@/components/preferences";
import { PageHeading } from "@/components/ui";
import { Icon } from "@/components/icons";
import { assignmentSubmissionState } from "@/lib/study-statistics";
import { TaskDecomposition } from "@/components/task-decomposition";

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
const version = "haui-compass-academic-import-v1";

export default function AcademicPage() {
  const { context, refresh } = useWorkspace();
  // On staging the imported data is owned by the signed-in account.
  const student = academicStudentId(context);
  const remember = (selected: Source) => {
    window.localStorage.setItem(ACADEMIC_SOURCE_KEY, selected);
    window.localStorage.setItem(ACADEMIC_STUDENT_KEY, student);
  };
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
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [courseFilter, setCourseFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const visibleSubmitted = Object.fromEntries(
    (context?.assignments || [])
      .filter((a) => a.submitted_at)
      .map((a) => [a.assignment_id, a.submitted_at!]),
  );
  const filteredAssignments = (context?.assignments || []).filter(
    (a) =>
      (!courseFilter || a.course === courseFilter) &&
      (!statusFilter ||
        assignmentSubmissionState(a, context!.now) === statusFilter) &&
      `${a.course} ${a.title}`
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  async function submitSimulated(assignmentId: string) {
    if (submitting || visibleSubmitted[assignmentId]) return;
    setSubmitting(assignmentId);
    setError("");
    try {
      await api<{ assignment_id: string; submitted_at: string }>(
        `demo/submissions/${assignmentId}`,
        {},
      );
      setNotice(
        language === "vi"
          ? "Đã ghi nhận nộp bài mô phỏng."
          : "Simulated submission recorded.",
      );
      await refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not record submission.",
      );
    } finally {
      setSubmitting(null);
    }
  }

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
    [source, student],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function importManual(event: FormEvent) {
    event.preventDefault();
    if (importing) return;
    setImporting(true);
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
      remember("manual");
      window.dispatchEvent(new Event("academic-data-changed"));
      await load("manual");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not import academic data.",
      );
    } finally {
      setImporting(false);
    }
  }
  async function importFile() {
    if (!file || importing) return;
    setImporting(true);
    setError("");
    try {
      const content = await file.text();
      if (file.name.endsWith(".csv")) {
        await api("academic-data/import/csv", {
          student_external_id: student,
          content,
        });
        setSource("csv");
        remember("csv");
        await load("csv");
      } else if (file.name.endsWith(".json")) {
        await api("academic-data/import", {
          ...JSON.parse(content),
          student_external_id: student,
        });
        setSource("json");
        remember("json");
        await load("json");
      } else {
        throw new Error("Choose a .csv or .json academic-data file.");
      }
      setNotice(`${t("academic.fileImported")} (${file.name})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import file.");
    } finally {
      setImporting(false);
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
          {context.mode === SIMULATED_MODE && <></>}
          <div className="assignment-filters">
            <label>
              {language === "vi" ? "Tìm bài tập" : "Search assignments"}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <label>
              {language === "vi" ? "Lọc môn học" : "Filter course"}
              <select
                aria-label={language === "vi" ? "Lọc môn học" : "Filter course"}
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
              >
                <option value="">
                  {language === "vi" ? "Tất cả môn" : "All courses"}
                </option>
                {[...new Set(context.assignments?.map((a) => a.course))].map(
                  (course) => (
                    <option key={course}>{course}</option>
                  ),
                )}
              </select>
            </label>
            <label>
              {language === "vi"
                ? "Lọc trạng thái nộp"
                : "Filter submission status"}
              <select
                aria-label={
                  language === "vi"
                    ? "Lọc trạng thái nộp"
                    : "Filter submission status"
                }
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {[
                  ["", "Tất cả trạng thái", "All statuses"],
                  ["pending", "Chưa đến hạn", "Not yet due"],
                  ["overdue", "Quá hạn chưa nộp", "Overdue"],
                  ["on_time", "Đã nộp đúng hạn", "Submitted on time"],
                  ["late", "Đã nộp trễ", "Submitted late"],
                ].map(([value, vi, en]) => (
                  <option key={value} value={value}>
                    {language === "vi" ? vi : en}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filteredAssignments.length === 0 && (
            <p role="status">
              {language === "vi"
                ? "Không có bài tập phù hợp bộ lọc."
                : "No assignments match these filters."}
            </p>
          )}
          <ul className="academic-list">
            {filteredAssignments.map((assignment) => {
              const tasks = context.tasks.filter(
                (task) => task.assignment_id === assignment.assignment_id,
              );
              return (
                <li key={assignment.external_id} className="assignment-card">
                  <div className="assignment-main">
                    <div className="assignment-heading">
                      <div className="assignment-identity">
                        <div className="assignment-field">
                          <span className="assignment-field-label">
                            {language === "vi" ? "Môn học" : "Course"}
                          </span>
                          <strong>{assignment.course}</strong>
                        </div>
                        <div className="assignment-field">
                          <span className="assignment-field-label">
                            {language === "vi" ? "Bài tập" : "Assignment"}
                          </span>
                          <strong>{assignment.title}</strong>
                        </div>
                        <div className="assignment-field">
                          <span className="assignment-field-label">
                            {t("academic.deadline")}
                          </span>
                          <strong>
                            {date(assignment.deadline, {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </strong>
                        </div>
                      </div>
                      <TaskDecomposition
                        assignment={assignment}
                        student={context.student}
                        onConfirmed={refresh}
                      />
                    </div>
                    {assignment.instructions && (
                      <details className="assignment-details">
                        <summary>
                          {language === "vi"
                            ? "Xem yêu cầu bài tập"
                            : "View assignment instructions"}
                        </summary>
                        <p>{assignment.instructions}</p>
                        <small>
                          {language === "vi" ? "Nguồn:" : "Source:"}{" "}
                          {assignment.source_label}
                        </small>
                      </details>
                    )}
                    <details className="assignment-steps">
                      <summary>
                        <span>
                          {language === "vi"
                            ? "Công việc học tập"
                            : "Study tasks"}
                        </span>
                        <span className="assignment-task-count">
                          {tasks.length}
                        </span>
                      </summary>
                      {tasks.length ? (
                        <div className="assignment-task-list">
                          {tasks.map((task) => (
                            <div className="assignment-task" key={task.id}>
                              <strong>{task.title}</strong>
                              <span>
                                {minutes(task.estimated_duration_seconds)} min
                              </span>
                              <span>{label(task.status, language)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="assignment-no-tasks">
                          {t("academic.noConfirmedTasks")}
                        </p>
                      )}
                    </details>
                    {context.mode === SIMULATED_MODE && (
                      <div className="assignment-submission">
                        <span className="assignment-field-label">
                          {language === "vi" ? "Nộp bài" : "Submission"}
                        </span>
                        {visibleSubmitted[assignment.assignment_id] ? (
                          <p role="status">
                            <strong>
                              {language === "vi"
                                ? "Đã nộp mô phỏng"
                                : "Submitted in simulation"}
                            </strong>
                            <span>
                              {date(
                                visibleSubmitted[assignment.assignment_id],
                                {
                                  day: "numeric",
                                  month: "short",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )}
                              {Date.parse(
                                visibleSubmitted[assignment.assignment_id],
                              ) <= Date.parse(assignment.deadline)
                                ? language === "vi"
                                  ? " · đúng hạn"
                                  : " · on time"
                                : language === "vi"
                                  ? " · trễ hạn"
                                  : " · late"}
                            </span>
                          </p>
                        ) : (
                          <button
                            type="button"
                            className="secondary small"
                            aria-label={`${language === "vi" ? "Nộp bài mô phỏng" : "Submit simulated assignment"}: ${assignment.title}`}
                            disabled={submitting !== null}
                            onClick={() =>
                              void submitSimulated(assignment.assignment_id)
                            }
                          >
                            {submitting === assignment.assignment_id
                              ? language === "vi"
                                ? "Đang ghi nhận…"
                                : "Recording…"
                              : language === "vi"
                                ? "Nộp bài mô phỏng"
                                : "Submit simulated assignment"}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
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

              <button className="primary" disabled={importing}>
                {importing ? "…" : t("academic.importManual")}
              </button>
            </form>
          </section>
          <section hidden={importMode !== "file"}>
            <h2>{t("academic.fileImport")}</h2>

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
              disabled={!file || importing}
              onClick={() => void importFile()}
            >
              {t("academic.validateImport")}
            </button>
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
