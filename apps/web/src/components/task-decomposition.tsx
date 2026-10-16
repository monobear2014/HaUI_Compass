"use client";

import { useState } from "react";
import { api, Assignment } from "@/lib/api";
import { usePreferences } from "./preferences";

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
export function TaskDecomposition({
  assignment,
  student,
  onConfirmed,
}: {
  assignment: Assignment;
  student: { provider: string; id: string };
  onConfirmed: () => Promise<void>;
}) {
  const { t, language } = usePreferences();
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
          {language === "vi"
            ? `Đã thêm ${created.length} việc: ${created.join("; ")}`
            : `Added ${created.length} confirmed tasks: ${created.join("; ")}`}
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
