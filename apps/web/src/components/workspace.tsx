"use client";
import {
  createContext,
  Fragment,
  useRef,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  ACADEMIC_SOURCE_KEY,
  ACADEMIC_STUDENT_KEY,
  api,
  ApiError,
  Context,
  Plan,
  Recommendation,
  Replan,
  scope,
} from "@/lib/api";

async function loadContext(): Promise<Context> {
  const source = window.localStorage.getItem(ACADEMIC_SOURCE_KEY);
  if (!source) return api<Context>("demo/context");
  const student =
    window.localStorage.getItem(ACADEMIC_STUDENT_KEY) || "pilot-student";
  try {
    return await api<Context>(
      `academic-data/context?source=${encodeURIComponent(source)}&student_external_id=${encodeURIComponent(student)}`,
    );
  } catch (err) {
    // A selection left by another account (or removed data) is not ours: start over.
    if (!(err instanceof ApiError) || ![403, 404].includes(err.status))
      throw err;
    window.localStorage.removeItem(ACADEMIC_SOURCE_KEY);
    window.localStorage.removeItem(ACADEMIC_STUDENT_KEY);
    return api<Context>("demo/context");
  }
}

type DemoScenario = { id: string; label: string };

type Workspace = {
  scenarios: DemoScenario[];
  switching: boolean;
  selectScenario: (id: string) => Promise<void>;
  advanceClock: (to: "next_day" | "next_week") => Promise<void>;
  context: Context | null;
  history: Plan[];
  recommendation: Recommendation | null;
  loading: boolean;
  error: string;
  revision: Replan | null;
  refresh: () => Promise<void>;
  setRevision: (result: Replan) => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);
export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [scenarios, setScenarios] = useState<DemoScenario[]>([]);
  const [switching, setSwitching] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const requestVersion = useRef(0);
  const [context, setContext] = useState<Context | null>(null);
  const [history, setHistory] = useState<Plan[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState<Replan | null>(null);
  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError("");
    try {
      const ctx = await loadContext();
      const [plans, recommendation] = await Promise.all([
        api<Plan[]>("weekly-plans/history?" + scope(ctx)),
        api<Recommendation>("daily-recommendation", {
          student: ctx.student,
          available_minutes: ctx.available_minutes ?? 210,
          assignment_capacities: ctx.assignment_capacities || [],
        }),
      ]);
      if (version !== requestVersion.current) return;
      setContext(ctx);
      setHistory(plans);
      setRecommendation(recommendation);
    } catch (err) {
      if (version !== requestVersion.current) return;
      setError(
        err instanceof Error ? err.message : "Could not load your workspace.",
      );
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);
  const selectScenario = useCallback(
    async (id: string) => {
      requestVersion.current += 1;
      setSwitching(true);
      setError("");
      try {
        await api<Context>("demo/scenarios/select", { scenario_id: id });
        window.localStorage.removeItem(ACADEMIC_SOURCE_KEY);
        window.localStorage.removeItem(ACADEMIC_STUDENT_KEY);
        setContext(null);
        setHistory([]);
        setRecommendation(null);
        setRevision(null);
        setEpoch((value) => value + 1);
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not select scenario.",
        );
      } finally {
        setSwitching(false);
      }
    },
    [refresh],
  );
  const advanceClock = useCallback(
    async (to: "next_day" | "next_week") => {
      setError("");
      try {
        // Demo-only: the opt-in fictional API moves its own clock forward.
        await api<Context>("demo/clock/advance", { to });
        setRevision(null);
        await refresh();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Could not change demo time.",
        );
      }
    },
    [refresh],
  );
  useEffect(() => {
    void api<DemoScenario[]>("demo/scenarios")
      .then(setScenarios)
      .catch(() => {});
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    const changed = () => void refresh();
    window.addEventListener("academic-data-changed", changed);
    return () => window.removeEventListener("academic-data-changed", changed);
  }, [refresh]);
  return (
    <WorkspaceContext.Provider
      value={{
        scenarios,
        switching,
        selectScenario,
        advanceClock,
        context,
        history,
        recommendation,
        loading,
        error,
        revision,
        refresh,
        setRevision,
      }}
    >
      <Fragment key={epoch}>{children}</Fragment>
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is required");
  return value;
}
