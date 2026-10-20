"use client";
import { AccountAvatar } from "./account-avatar";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ACADEMIC_SOURCE_KEY, ACADEMIC_STUDENT_KEY } from "@/lib/api";
import type { StudyDocument } from "@/lib/documents";
import type { TranslationKey } from "@/lib/i18n";
import { CompanionRail } from "./companion-rail";
import { Icon } from "./icons";
import { usePreferences } from "./preferences";
import { DemoClockBar } from "./weekly";
import { useWorkspace } from "./workspace";
import styles from "./learning-shell.module.css";
import { validCoursewareId } from "@/lib/courseware-navigation";

const links = [
  { href: "/today", title: "nav.today", icon: "today" },
  { href: "/plan", title: "nav.plan", icon: "plan" },
  { href: "/academic", title: "nav.academic", icon: "book" },
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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatWidth, setChatWidth] = useState(340);
  const chatResize = useRef<{
    pointerId: number;
    x: number;
    width: number;
  } | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const chatLauncher = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDetailsElement>(null);
  const [assistantCourse, setAssistantCourse] = useState<string | null>(null);
  const privateStudySet = path.startsWith("/study-set/");
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setLeftCollapsed(
          localStorage.getItem("compass-left-collapsed") === "true",
        );
        const saved = localStorage.getItem("compass-chat-open");
        setChatOpen(
          saved === null ? window.innerWidth >= 1280 : saved === "true",
        );
        const savedWidth = Number(localStorage.getItem("compass-chat-width"));
        if (
          Number.isFinite(savedWidth) &&
          savedWidth >= 280 &&
          savedWidth <= 640
        )
          setChatWidth(savedWidth);
      } catch {
        setChatOpen(window.innerWidth >= 1280);
      }
      setLayoutReady(true);
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  function toggleLeft() {
    const next = !leftCollapsed;
    setLeftCollapsed(next);
    try {
      localStorage.setItem("compass-left-collapsed", String(next));
    } catch {}
  }
  function showChat(value: boolean) {
    setChatOpen(value);
    try {
      localStorage.setItem("compass-chat-open", String(value));
    } catch {}
    requestAnimationFrame(() => {
      if (!value) chatLauncher.current?.focus();
      else
        document
          .getElementById("compass-chat-panel")
          ?.querySelector<HTMLTextAreaElement>("textarea")
          ?.focus();
    });
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (event.key === "Escape" && accountMenu.current?.open) {
        accountMenu.current.open = false;
        accountMenu.current.querySelector("summary")?.focus();
        return;
      }
      if (event.key === "Escape" && chatOpen) {
        setChatOpen(false);
        try {
          localStorage.setItem("compass-chat-open", "false");
        } catch {}
        requestAnimationFrame(() => chatLauncher.current?.focus());
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen]);

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
    path === "/settings" ||
    path === "/learn" ||
    path.startsWith("/study-set/") ||
    path.startsWith("/documents/");
  const documentId = path.split("/")[2];
  const activeDocument = documents.find((doc) => doc.id === documentId);
  const title =
    path === "/settings"
      ? vi
        ? "Cài đặt tài khoản"
        : "Account settings"
      : libraryRoute
        ? path === "/learn"
          ? vi
            ? "Không gian học"
            : "My learning space"
          : activeDocument?.name || (vi ? "Bộ học tập" : "Study set")
        : t(
            ([...links, ...reviewLinks].find((item) => item.href === path)
              ?.title || "nav.today") as TranslationKey,
          );

  useEffect(() => {
    const controller = new AbortController();
    const loadUser = () => {
      void fetch("/api/auth/session", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((r) => r.json())
        .then((result) => {
          if (result.user) setUser(result.user);
          else window.location.replace("/login");
        })
        .catch(() => {});
    };
    loadUser();
    window.addEventListener("account-profile-updated", loadUser);
    return () => {
      controller.abort();
      window.removeEventListener("account-profile-updated", loadUser);
    };
  }, []);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<{ course?: string }>).detail;
      setAssistantCourse(validCoursewareId(detail?.course || null));
      showChat(true);
    };
    const outside = (event: PointerEvent) => {
      if (
        accountMenu.current?.open &&
        !accountMenu.current.contains(event.target as Node)
      )
        accountMenu.current.open = false;
    };
    window.addEventListener("compass-open-assistant", open);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("compass-open-assistant", open);
      document.removeEventListener("pointerdown", outside);
    };
  }, []);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("assistant") !== "1") return;
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      setAssistantCourse(validCoursewareId(query.get("course")) || "ai");
      showChat(true);
    });
    return () => {
      active = false;
    };
  }, [path]);
  useEffect(() => {
    const controller = new AbortController();
    const loadDocuments = () => {
      void fetch("/api/documents", {
        cache: "no-store",
        signal: controller.signal,
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (result) setDocuments(result.documents);
        })
        .catch(() => {});
    };
    loadDocuments();
    window.addEventListener("focus", loadDocuments);
    window.addEventListener("compass-documents-changed", loadDocuments);
    return () => {
      controller.abort();
      window.removeEventListener("focus", loadDocuments);
      window.removeEventListener("compass-documents-changed", loadDocuments);
    };
  }, [path]);

  async function logout() {
    setLoggingOut(true);
    setLogoutError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("logout_failed");
      // The academic-data selection belongs to this account, not to the browser.
      window.localStorage.removeItem(ACADEMIC_SOURCE_KEY);
      window.localStorage.removeItem(ACADEMIC_STUDENT_KEY);
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
        aria-label={t(item.title as TranslationKey)}
        title={t(item.title as TranslationKey)}
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
    <>
      <div
        className={styles.app}
        data-menu-open={menuOpen}
        data-left-collapsed={leftCollapsed}
        data-chat-open={chatOpen}
        style={{ "--chat-rail-width": `${chatWidth}px` } as React.CSSProperties}
      >
        <a className="skip-link" href="#main">
          {t("common.skipContent")}
        </a>
        <aside
          id="compass-left-navigation"
          className={styles.sidebar}
          aria-label={vi ? "Điều hướng chính" : "Main navigation"}
        >
          <Link
            href="/learn"
            aria-label="HaUI Compass"
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

          <nav className={styles.navigation} aria-label={t("nav.workspace")}>
            <Link
              href="/learn"
              aria-label={vi ? "Không gian học" : "My learning space"}
              title={vi ? "Không gian học" : "My learning space"}
              className={styles.navLink}
              aria-current={libraryRoute ? "page" : undefined}
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="book" size={19} />
              <span>{vi ? "Không gian học" : "My learning space"}</span>
            </Link>
            {links.map(navLink)}
          </nav>
          <Link
            aria-label={vi ? "Thêm tài liệu" : "Add materials"}
            title={vi ? "Thêm tài liệu" : "Add materials"}
            className={styles.upload}
            href="/documents/upload?next=%2Flearn"
            onClick={() => setMenuOpen(false)}
          >
            <Icon name="plus" size={18} />
            <span>{vi ? "Thêm tài liệu" : "Add materials"}</span>
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
          {leftCollapsed ? (
            <nav
              className={styles.navigation}
              aria-label={vi ? "Nhìn lại việc học" : "Review my learning"}
            >
              {reviewLinks.map(navLink)}
            </nav>
          ) : (
            <details
              className={styles.review}
              data-testid="review-navigation"
              open={reviewLinks.some((item) => item.href === path) || undefined}
            >
              <summary>
                {vi ? "Nhìn lại việc học" : "Review my learning"}
              </summary>
              <nav aria-label={vi ? "Nhìn lại việc học" : "Review my learning"}>
                {reviewLinks.map(navLink)}
              </nav>
            </details>
          )}
          <details
            ref={accountMenu}
            className={styles.profile}
            data-testid="account-menu"
          >
            <summary
              className={styles.profileSummary}
              aria-label={vi ? "Menu tài khoản" : "Account menu"}
              title={user?.name || (vi ? "Tài khoản" : "Account")}
            >
              <span className={styles.avatar}>
                <AccountAvatar name={user?.name || ""} />
              </span>
              <span className={styles.profileText}>
                <strong>
                  {user?.name || (vi ? "Sinh viên HaUI" : "HaUI student")}
                </strong>
                <small>
                  {vi ? "Tài khoản & cài đặt" : "Account & settings"}
                </small>
              </span>
            </summary>
            <div className={styles.accountPanel}>
              <strong>{user?.name}</strong>
              <Link
                href="/settings"
                onClick={() => {
                  if (accountMenu.current) accountMenu.current.open = false;
                  setMenuOpen(false);
                }}
              >
                {vi ? "Cài đặt tài khoản" : "Account settings"}
              </Link>
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
                </details>
              )}
              <button onClick={logout} disabled={loggingOut}>
                {loggingOut ? "…" : vi ? "Đăng xuất" : "Sign out"}
              </button>
            </div>
          </details>
        </aside>
        <div className={styles.content}>
          <header className={styles.topbar}>
            <button
              type="button"
              className={styles.collapseButton}
              disabled={!layoutReady}
              aria-label={
                vi
                  ? leftCollapsed
                    ? "Mở rộng menu trái"
                    : "Thu gọn menu trái"
                  : leftCollapsed
                    ? "Expand left menu"
                    : "Collapse left menu"
              }
              aria-expanded={!leftCollapsed}
              aria-controls="compass-left-navigation"
              onClick={toggleLeft}
              title={vi ? "Ẩn/hiện nhãn menu" : "Toggle menu labels"}
            >
              <Icon name="menu" size={18} />
            </button>

            <button
              className={styles.menuButton}
              disabled={!layoutReady}
              aria-expanded={menuOpen}
              aria-label={vi ? "Mở điều hướng" : "Toggle navigation"}
              onClick={() => {
                if (chatOpen) showChat(false);
                setMenuOpen(!menuOpen);
              }}
            >
              <Icon name={menuOpen ? "close" : "menu"} />
            </button>
            <div className={styles.breadcrumb}>
              <Link href="/learn">{vi ? "Góc học tập" : "Learning space"}</Link>
              <span>/</span>
              <strong title={title}>{title}</strong>
            </div>
            {!chatOpen && (
              <button
                type="button"
                ref={chatLauncher}
                aria-controls="compass-chat-panel"
                className={styles.chatLauncher}
                disabled={!layoutReady}
                aria-label={vi ? "Mở chatbot" : "Open chatbot"}
                onClick={() => {
                  setMenuOpen(false);
                  showChat(true);
                }}
              >
                <Icon name="ask" size={18} />
                <span>{vi ? "Trợ lý" : "Assistant"}</span>
              </button>
            )}
            <div
              className={styles.appearance}
              role="group"
              aria-label={
                vi ? "Ngôn ngữ và giao diện" : "Language and appearance"
              }
            >
              <div role="group" aria-label={vi ? "Ngôn ngữ" : "Language"}>
                <button
                  onClick={() => setLanguage("vi")}
                  aria-pressed={vi}
                  aria-label="Tiếng Việt"
                >
                  VI
                </button>
                <button
                  onClick={() => setLanguage("en")}
                  aria-pressed={!vi}
                  aria-label="English"
                >
                  EN
                </button>
              </div>
              <button
                onClick={toggleTheme}
                aria-label={
                  theme === "light"
                    ? t("common.darkMode")
                    : t("common.lightMode")
                }
                title={
                  theme === "light"
                    ? t("common.darkMode")
                    : t("common.lightMode")
                }
              >
                <Icon name={theme === "light" ? "moon" : "sun"} size={18} />
              </button>
            </div>
          </header>
          <main id="main" className={styles.workspace}>
            {logoutError && (
              <p role="alert">
                {vi
                  ? "Chưa đăng xuất được. Vui lòng thử lại."
                  : "Unable to sign out. Please retry."}
              </p>
            )}
            {!libraryRoute && <DemoClockBar />}
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
        </div>
        <aside
          id="compass-chat-panel"
          className={styles.chatRail}
          aria-label={vi ? "Chatbot Compass" : "Compass chatbot"}
          aria-hidden={!chatOpen}
          inert={!chatOpen}
          style={
            { "--chat-rail-width": `${chatWidth}px` } as React.CSSProperties
          }
        >
          <div
            className={styles.chatResize}
            role="separator"
            aria-orientation="vertical"
            aria-label={vi ? "Điều chỉnh độ rộng chatbot" : "Resize chatbot"}
            aria-valuemin={280}
            aria-valuemax={640}
            aria-valuenow={chatWidth}
            tabIndex={0}
            onPointerDown={(event) => {
              chatResize.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                width: chatWidth,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
              event.preventDefault();
            }}
            onPointerMove={(event) => {
              const start = chatResize.current;
              if (!start || start.pointerId !== event.pointerId) return;
              setChatWidth(
                Math.max(
                  280,
                  Math.min(640, start.width + start.x - event.clientX),
                ),
              );
            }}
            onPointerUp={(event) => {
              if (chatResize.current?.pointerId !== event.pointerId) return;
              chatResize.current = null;
              try {
                localStorage.setItem("compass-chat-width", String(chatWidth));
              } catch {}
              event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
              chatResize.current = null;
            }}
            onKeyDown={(event) => {
              let next = chatWidth;
              if (event.key === "ArrowLeft") next += 16;
              else if (event.key === "ArrowRight") next -= 16;
              else if (event.key === "Home") next = 280;
              else if (event.key === "End") next = 640;
              else return;
              event.preventDefault();
              next = Math.max(280, Math.min(640, next));
              setChatWidth(next);
              try {
                localStorage.setItem("compass-chat-width", String(next));
              } catch {}
            }}
          />
          <CompanionRail
            courseHint={assistantCourse}
            documentHint={privateStudySet ? path.split("/")[2] : null}
            documents={documents}
            onClose={() => showChat(false)}
          />
        </aside>
      </div>
    </>
  );
}
