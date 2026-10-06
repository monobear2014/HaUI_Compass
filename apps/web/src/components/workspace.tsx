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
import { api, Context, Plan, Recommendation, Replan, scope } from "@/lib/api";

type DemoScenario = { id: string; label: string };

type Workspace = {
  scenarios: DemoScenario[];
  switching: boolean;
  selectScenario: (id: string) => Promise<void>;
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
      const source = window.localStorage.getItem(
        "haui-compass-academic-source",
      );
      const ctx = await api<Context>(
        source
          ? `academic-data/context?source=${source}&student_external_id=pilot-student`
          : "demo/context",
      );
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
        window.localStorage.removeItem("haui-compass-academic-source");
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
