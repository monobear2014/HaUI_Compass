"use client";

import { FormEvent, useState } from "react";
import { api, apiDelete } from "@/lib/api";

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
const student = "pilot-student";
const version = "haui-compass-academic-import-v1";

export default function AcademicPage() {
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

  async function load(selected = source) {
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
  }
  async function importManual(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const courseId = course.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
      const assignmentId = assignment.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
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
      setNotice("Manual academic data imported. It is your planning input, not LMS data.");
      await load("manual");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import academic data.");
    }
  }
  async function importFile() {
    if (!file) return;
    setError("");
    try {
      const content = await file.text();
      if (file.name.endsWith(".csv")) {
        await api("academic-data/import/csv", { student_external_id: student, content });
        setSource("csv");
        await load("csv");
      } else if (file.name.endsWith(".json")) {
        await api("academic-data/import", JSON.parse(content));
        setSource("json");
        await load("json");
      } else {
        throw new Error("Choose a .csv or .json academic-data file.");
      }
      setNotice(`Imported ${file.name}. Server validation accepted the complete dataset.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import file.");
    }
  }
  async function createTask(item: Academic["assignments_data"][number]) {
    try {
      await api("tasks", {
        student: { provider: source, id: student },
        assignment: { provider: source, id: item.external_id },
        task_id: crypto.randomUUID(),
        title: `Work on ${item.title}`,
        estimated_effort_minutes: item.estimated_effort_minutes || 60,
      });
      setNotice("Study task created. It can now be used by the existing planning loop.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create study task.");
    }
  }
  return (
    <>
      <section className="page-heading">
        <span className="eyebrow accent">ACADEMIC DATA</span>
        <h1>Bring your own academic workload.</h1>
        <p>Manual entry and file imports are student-provided pilot data, never official HaUI data.</p>
      </section>
      <div className="academic-grid">
        <section className="panel">
          <h2>Manual entry</h2>
          <form className="form-stack" onSubmit={importManual}>
            <label>Course name<input required value={course} onChange={(e) => setCourse(e.target.value)} /></label>
            <label>Course code <input value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <label>Assignment title<input required value={assignment} onChange={(e) => setAssignment(e.target.value)} /></label>
            <label>Deadline<input required type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></label>
            <label>Planning estimate (minutes)<input required min="1" type="number" value={effort} onChange={(e) => setEffort(e.target.value)} /></label>
            <p className="fine-print">This is your focused-study estimate, not an LMS value.</p>
            <button className="primary">Import manual data</button>
          </form>
        </section>
        <section className="panel">
          <h2>CSV or JSON import</h2>
          <p>Choose a fictional or authorized academic-data file. Only .csv and .json are accepted.</p>
          <input aria-label="Academic data file" type="file" accept=".csv,.json,application/json,text/csv" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          {file && <p className="fine-print">Selected: {file.name}</p>}
          <button className="primary" disabled={!file} onClick={() => void importFile()}>Validate and import</button>
          <p className="fine-print">The server validates the full file before committing it.</p>
        </section>
      </div>
      <section className="panel academic-current">
        <div className="section-heading"><h2>Current imported data</h2><select value={source} onChange={(e) => { const next = e.target.value as Source; setSource(next); void load(next); }}><option value="manual">Manual</option><option value="csv">CSV</option><option value="json">JSON</option></select></div>
        <button className="secondary small" onClick={() => void load()}>Refresh</button>
        {notice && <p className="form-success">{notice}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        {data ? <><p className="fine-print">Provenance: {data.source.toUpperCase()} · {data.courses} courses · {data.assignments} assignments · {data.submissions} submissions</p><ul className="academic-list">{data.assignments_data.map((item) => <li key={item.external_id}><div><strong>{item.title}</strong><span>{item.course_external_id} · {item.deadline ? new Date(item.deadline).toLocaleString() : "No deadline"}</span></div><button className="secondary small" onClick={() => void createTask(item)}>Create study task</button></li>)}</ul><button className="text-link" onClick={async () => { await apiDelete(`academic-data?source=${source}&student_external_id=${student}`); setData(null); setNotice("Imported data cleared. Existing study tasks are protected."); }}>Clear this imported source</button></> : <p>No imported data for this source yet.</p>}
      </section>
    </>
  );
}
