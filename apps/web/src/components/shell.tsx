"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { date } from "@/lib/api";
import { Icon } from "./icons";
import { usePreferences } from "./preferences";
import { useWorkspace } from "./workspace";

const links = [
  { href: "/", title: "today", icon: "today" },
  { href: "/plan", title: "weeklyPlan", icon: "plan" },
  { href: "/reflect", title: "reflect", icon: "reflect" },
  { href: "/history", title: "history", icon: "history" },
  { href: "/academic", title: "academicData", icon: "book" },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { language, setLanguage, theme, toggleTheme, t } = usePreferences();
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
        {t("skipContent")}
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
        <p className="brand-tagline">
          {language === "vi"
            ? "Biết việc nên làm tiếp theo."
            : "Know what to do next."}
        </p>
        <span className="nav-label">{t("workspace")}</span>
        <nav aria-label="Primary navigation">
          {links.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
              className={path === item.href ? "nav-link active" : "nav-link"}
            >
              <Icon name={item.icon} />
              <span>{t(item.title)}</span>
              {path === item.href && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="demo-dot" />
            {t("demoWorkspace")}
            <p>
              {t("fictionalData")}
              <br />
              {t("resetsOnRestart")}
            </p>
          </div>
          <div className="profile">
            <span className="avatar">AN</span>
            <div>
              <strong>An Nguyen</strong>
              <span>{t("demoStudent")}</span>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {t("studentWorkspace")} <span className="topbar-divider">/</span>{" "}
            <strong>
              {t(links.find((item) => item.href === path)?.title || "today")}
            </strong>
          </span>
          <div className="topbar-right">
            <span className="timezone">Asia/Ho_Chi_Minh</span>
            <span className="demo-badge">DEMO</span>
            <div className="preferences" aria-label={t("language")}>
              <button
                className={
                  language === "en" ? "preference active" : "preference"
                }
                onClick={() => setLanguage("en")}
                aria-pressed={language === "en"}
              >
                EN
              </button>
              <button
                className={
                  language === "vi" ? "preference active" : "preference"
                }
                onClick={() => setLanguage("vi")}
                aria-pressed={language === "vi"}
              >
                VI
              </button>
              <button
                className="preference theme-toggle"
                onClick={toggleTheme}
                aria-label={theme === "light" ? t("darkMode") : t("lightMode")}
                title={theme === "light" ? t("darkMode") : t("lightMode")}
              >
                <Icon name={theme === "light" ? "moon" : "sun"} size={16} />
              </button>
            </div>
          </div>
        </header>
        <main id="main" className="workspace">
          {scenarios.length > 0 && (
            <section className="demo-selector panel" aria-label="Demo controls">
              <label>
                {t("demoScenario")}
                <select
                  aria-label="Demo scenario"
                  value={context?.scenario_id || ""}
                  disabled={loading || switching}
                  onChange={(event) => void selectScenario(event.target.value)}
                >
                  <option value="" disabled>
                    {t("selectScenario")}
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
                {t("resetScenario")}
              </button>
              <p className="fine-print">{t("scenarioNotice")}</p>
            </section>
          )}

          {error && (
            <div className="message error" role="alert">
              <Icon name="alert" />
              <div>
                <strong>{t("unavailable")}</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => void refresh()} disabled={loading}>
                {t("retry")}
              </button>
            </div>
          )}
          {switching ? (
            <p role="status">{t("loadingScenario")}</p>
          ) : loading && !context ? (
            <div className="loading-state" role="status">
              <div className="skeleton wide" />
              <div className="skeleton hero-skeleton" />
              <div className="skeleton wide" />
              {t("loadingWorkspace")}
            </div>
          ) : (
            children
          )}
        </main>
        <footer className="workspace-footer">
          <span>
            HaUI Compass <span className="muted">· {t("footer")}</span>
          </span>
          <span>
            {context
              ? date(context.now, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : t("learningLoop")}
          </span>
        </footer>
      </div>
    </div>
  );
}
