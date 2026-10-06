"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { StudyDocument } from "@/lib/documents";
import type { TranslationKey } from "@/lib/i18n";
import { Icon } from "./icons";
import { usePreferences } from "./preferences";
import { useWorkspace } from "./workspace";
import styles from "./learning-shell.module.css";

const links = [
  { href: "/today", title: "nav.today", icon: "today" },
  { href: "/plan", title: "nav.plan", icon: "plan" },
  { href: "/academic", title: "nav.academic", icon: "book" },
  { href: "/knowledge", title: "nav.knowledge", icon: "ask" },
];
const reviewLinks = [
  { href: "/dashboard", title: "nav.statistics", icon: "statistics" },
  { href: "/reflect", title: "nav.reflect", icon: "reflect" },
  { href: "/history", title: "nav.history", icon: "history" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { language, setLanguage, theme, toggleTheme, t } = usePreferences();
  const vi = language === "vi";
  const [user, setUser] = useState<{ name: string; username: string } | null>(
    null,
  );
  const [documents, setDocuments] = useState<StudyDocument[]>([]);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    context,
    error,
    loading,
    refresh,
    scenarios,
    switching,
    selectScenario,
  } = useWorkspace();
  const libraryRoute =
    path === "/learn" ||
    path.startsWith("/study-set/") ||
    path.startsWith("/documents/");
  const documentId = path.split("/")[2];
  const activeDocument = documents.find((doc) => doc.id === documentId);
  const title = libraryRoute
    ? path === "/learn"
      ? vi
        ? "Không gian học"
        : "My learning space"
      : activeDocument?.name || (vi ? "Bộ học tập" : "Study set")
    : t(
        ([...links, ...reviewLinks].find((item) => item.href === path)?.title ||
          "nav.today") as TranslationKey,
      );

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/session", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((result) => {
        if (result.user) setUser(result.user);
        else window.location.replace("/login");
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/documents", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => {
        if (result) setDocuments(result.documents);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [path]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout_failed");
      window.location.replace("/login");
    } catch {
      setLoggingOut(false);
      setLogoutError(true);
    }
  }
  function navLink(item: { href: string; title: string; icon: string }) {
    const active = path === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={styles.navLink}
        aria-current={active ? "page" : undefined}
        onClick={() => setMenuOpen(false)}
      >
        <Icon name={item.icon} size={19} />
        <span>{t(item.title as TranslationKey)}</span>
      </Link>
    );
  }

  return (
    <div className={styles.app} data-menu-open={menuOpen}>
      <a className="skip-link" href="#main">
        {t("common.skipContent")}
      </a>
      <aside
        className={styles.sidebar}
        aria-label={vi ? "Điều hướng chính" : "Main navigation"}
      >
        <Link
          href="/learn"
          className={styles.brand}
          onClick={() => setMenuOpen(false)}
        >
          <span className={styles.mark}>
            <Icon name="compass" size={28} />
          </span>
          <span>
            HaUI <strong>Compass</strong>
          </span>
        </Link>
        <p className={styles.tagline}>
          {vi ? "Học từng chút. Tiến xa hơn." : "Small steps. Real progress."}
        </p>
        <nav className={styles.navigation} aria-label={t("nav.workspace")}>
          <Link
            href="/learn"
            className={styles.navLink}
            aria-current={libraryRoute ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="book" size={19} />
            {vi ? "Không gian học" : "My learning space"}
          </Link>
          {links.map(navLink)}
        </nav>
        <Link
          className={styles.upload}
          href="/onboarding/upload?next=%2Flearn"
          onClick={() => setMenuOpen(false)}
        >
          <Icon name="plus" size={18} />
          {vi ? "Thêm tài liệu" : "Add materials"}
        </Link>
        {documents.length > 0 && (
          <div className={styles.materials}>
            <span className={styles.label}>
              {vi ? "BỘ HỌC TẬP GẦN ĐÂY" : "RECENT STUDY SETS"}
            </span>
            {documents.slice(0, 3).map((doc) => (
              <Link
                href={`/study-set/${doc.id}`}
                key={doc.id}
                aria-current={documentId === doc.id ? "page" : undefined}
                onClick={() => setMenuOpen(false)}
              >
                <span className={styles.fileIcon}>
                  <Icon name="book" size={15} />
                </span>
                <span title={doc.name}>{doc.name}</span>
              </Link>
            ))}
          </div>
        )}
        <details
          className={styles.review}
          data-testid="review-navigation"
          open={reviewLinks.some((item) => item.href === path) || undefined}
        >
          <summary>{vi ? "Nhìn lại việc học" : "Review my learning"}</summary>
          <nav aria-label={vi ? "Nhìn lại việc học" : "Review my learning"}>
            {reviewLinks.map(navLink)}
          </nav>
        </details>
        <div className={styles.profile}>
          <span className={styles.avatar}>
            {user?.name
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join("")
              .toUpperCase() || "SV"}
          </span>
          <div>
            <strong>
              {user?.name || (vi ? "Sinh viên HaUI" : "HaUI student")}
            </strong>
            <small>{vi ? "Không gian của bạn" : "Your personal space"}</small>
          </div>
        </div>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <button
            className={styles.menuButton}
            aria-expanded={menuOpen}
            aria-label={vi ? "Mở điều hướng" : "Toggle navigation"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
          <div className={styles.breadcrumb}>
            <Link href="/learn">{vi ? "Góc học tập" : "Learning space"}</Link>
            <span>/</span>
            <strong title={title}>{title}</strong>
          </div>
          <details className={styles.settings} data-testid="workspace-settings">
            <summary aria-label={vi ? "Tuỳ chọn" : "Settings"}>
              <Icon name="compass" size={17} />
              <span>{vi ? "Tuỳ chọn" : "Settings"}</span>
            </summary>
            <div className={styles.settingsPanel}>
              <p>{vi ? "Ngôn ngữ & giao diện" : "Language & appearance"}</p>
              <div className="inline">
                <button onClick={() => setLanguage("vi")} aria-pressed={vi}>
                  VI
                </button>
                <button onClick={() => setLanguage("en")} aria-pressed={!vi}>
                  EN
                </button>
                <button
                  onClick={toggleTheme}
                  aria-label={
                    theme === "light"
                      ? t("common.darkMode")
                      : t("common.lightMode")
                  }
                >
                  <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
                </button>
              </div>
              {scenarios.length > 0 && (
                <details className={styles.demo} data-testid="demo-controls">
                  <summary>{t("common.demoScenario")}</summary>
                  <label>
                    {t("common.demoScenario")}
                    <select
                      aria-label={t("common.demoScenario")}
                      value={context?.scenario_id || ""}
                      disabled={loading || switching}
                      onChange={(event) =>
                        void selectScenario(event.target.value)
                      }
                    >
                      <option value="" disabled>
                        {t("common.selectScenario")}
                      </option>
                      {scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>
                          {scenario.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    disabled={loading || switching || !context?.scenario_id}
                    onClick={() =>
                      context?.scenario_id &&
                      void selectScenario(context.scenario_id)
                    }
                  >
                    {t("common.resetScenario")}
                  </button>
                  <p>{t("common.demoNotice")}</p>
                </details>
              )}
              <button onClick={logout} disabled={loggingOut}>
                {loggingOut ? "…" : vi ? "Đăng xuất" : "Sign out"}
              </button>
            </div>
          </details>
        </header>
        <main id="main" className={styles.workspace}>
          {logoutError && (
            <p role="alert">
              {vi
                ? "Chưa đăng xuất được. Vui lòng thử lại."
                : "Unable to sign out. Please retry."}
            </p>
          )}
          {!libraryRoute && error && (
            <div className="message error" role="alert">
              <Icon name="alert" />
              <div>
                <strong>{t("common.unavailable")}</strong>
                <p>{error}</p>
              </div>
              <button onClick={() => void refresh()} disabled={loading}>
                {t("common.retry")}
              </button>
            </div>
          )}
          {!libraryRoute && (switching || (loading && !context)) ? (
            <p role="status">{t("common.loadingWorkspace")}</p>
          ) : (
            children
          )}
        </main>
        <footer className={styles.footer}>
          <span>
            HaUI Compass ·{" "}
            {vi ? "Đồng hành cùng việc học của bạn" : "Your learning companion"}
          </span>
          <span>
            {vi ? "Đồ án tốt nghiệp · HaUI" : "Graduation project · HaUI"}
          </span>
        </footer>
      </div>
    </div>
  );
}
