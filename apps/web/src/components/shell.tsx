"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { date } from "@/lib/api";
import { Icon } from "./icons";
import { useWorkspace } from "./workspace";

const links = [
  { href: "/", title: "Today", icon: "today" },
  { href: "/plan", title: "Weekly Plan", icon: "plan" },
  { href: "/reflect", title: "Reflect", icon: "reflect" },
  { href: "/history", title: "History", icon: "history" },
  { href: "/academic", title: "Academic Data", icon: "book" },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const {
    context,
    error,
    loading,
    refresh,
    scenarios,
    switching,
    selectScenario,
  } = useWorkspace();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <Icon name="compass" size={25} />
          </span>
          <span>
            HaUI <strong>Compass</strong>
          </span>
        </Link>
        <p className="brand-tagline">Know what to do next.</p>
        <span className="nav-label">YOUR WORKSPACE</span>
        <nav aria-label="Primary navigation">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              className={path === item.href ? "nav-link active" : "nav-link"}
            >
              <Icon name={item.icon} />
              <span>{item.title}</span>
              {path === item.href && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="demo-dot" />
            Demo workspace
            <p>
              Fictional student · Mock LMS
              <br />
              Data resets when API restarts.
            </p>
          </div>
          <div className="profile">
            <span className="avatar">AN</span>
            <div>
              <strong>An Nguyen</strong>
              <span>HaUI · Demo student</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Student workspace <span className="topbar-divider">/</span>{" "}
            <strong>{links.find((item) => item.href === path)?.title}</strong>
          </span>
          <div className="topbar-right">
            <span className="timezone">Asia/Ho_Chi_Minh</span>
            <span className="demo-badge">DEMO</span>
          </div>
        </header>
        <main id="main" className="workspace">
          {scenarios.length > 0 && (
            <section className="demo-selector panel" aria-label="Demo controls">
              <label>
                Demo scenario
                <select
                  aria-label="Demo scenario"
                  value={context?.scenario_id || ""}
                  disabled={loading || switching}
                  onChange={(event) => void selectScenario(event.target.value)}
                >
                  <option value="" disabled>
                    Select a fictional scenario
                  </option>
                  {scenarios.map((scenario) => (
                    <option key={scenario.id} value={scenario.id}>
                      {scenario.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary small"
                disabled={loading || switching || !context?.scenario_id}
                onClick={() =>
                  context?.scenario_id &&
                  void selectScenario(context.scenario_id)
                }
              >
                Reset this scenario
              </button>
              <p className="fine-print">
                Fictional data · fixed demo clock · selecting or resetting
                clears this in-memory demo session, including imports.
              </p>
            </section>
          )}

          {error && (
            <div className="message error" role="alert">
              <Icon name="alert" />
              <div>
                <strong>Workspace unavailable</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => void refresh()} disabled={loading}>
                Retry
              </button>
            </div>
          )}
          {switching ? (
            <p role="status">Loading fictional scenario…</p>
          ) : loading && !context ? (
            <div className="loading-state" role="status">
              <div className="skeleton wide" />
              <div className="skeleton hero-skeleton" />
              <div className="skeleton wide" />
              Loading your workspace…
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            HaUI Compass{" "}
            <span className="muted">
              · A little clarity, a better direction.
            </span>
          </span>
          <span>
            {context
              ? date(context.now, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Learning Loop v0"}
          </span>
        </footer>
      </div>
    </div>
  );
}
