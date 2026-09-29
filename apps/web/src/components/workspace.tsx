"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { api, Context, Plan, Recommendation, Replan, scope } from "@/lib/api";

type Workspace = {
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
  const [context, setContext] = useState<Context | null>(null);
  const [history, setHistory] = useState<Plan[]>([]);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState<Replan | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const source = window.localStorage.getItem("haui-compass-academic-source");
      const ctx = await api<Context>(
        source
          ? `academic-data/context?source=${source}&student_external_id=pilot-student`
          : "demo/context",
      );
      const [plans, recommendation] = await Promise.all([
        api<Plan[]>("weekly-plans/history?" + scope(ctx)),
        api<Recommendation>("daily-recommendation", {
          student: ctx.student,
          available_minutes: 210,
          assignment_capacities: [],
        }),
      ]);
      setContext(ctx);
      setHistory(plans);
      setRecommendation(recommendation);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your workspace.",
      );
    } finally {
      setLoading(false);
    }
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
      {children}
    </WorkspaceContext.Provider>
  );
}
export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("WorkspaceProvider is required");
  return value;
}
