"use client";

import Link from "next/link";
import { usePreferences } from "../preferences";
import styles from "./compass.module.css";

export function CIcon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    back: <path d="M20 12H4m6-6-6 6 6 6" />,
    up: <path d="M12 20V4m-6 6 6-6 6 6" />,
    book: (
      <>
        <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15" />
      </>
    ),
    plan: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M7 2v6m10-6v6M3 11h18" />
        <circle cx="14" cy="16" r="3" />
        <path d="M14 14v2l1 1" />
      </>
    ),
    file: (
      <>
        <path d="M5 3h9l5 5v13H5zM14 3v6h5M8 13h8m-8 4h6" />
      </>
    ),
    chat: (
      <>
        <path d="M3 4h18v13H8l-5 4z" />
        <path d="M8 8h3v4H9m5-4h3v4h-2" />
      </>
    ),
    reflect: (
      <>
        <path d="M3 5v5h5M4 9a8 8 0 1 1 0 6" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m3 11v-3a5 5 0 0 0-3-4" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 4v6c0 4-5 7-8 8-3-1-8-4-8-8V7z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    quote: (
      <>
        <path d="M4 4h6v8H6c0 3-1 5-3 6m11-14h6v8h-4c0 3-1 5-3 6" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1m12-12 1-1" />
      </>
    ),
    moon: <path d="M21 14a9 9 0 0 1-11-11 9 9 0 1 0 11 11" />,
    grad: (
      <>
        <path d="m2 9 10-5 10 5-10 5zM6 11v6c4 3 8 3 12 0v-6m4-2v7" />
      </>
    ),
    spark: (
      <>
        <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4" />
      </>
    ),
    pause: (
      <>
        <path d="M8 5v14M16 5v14" />
      </>
    ),
    play: <path d="m7 4 13 8-13 8z" />,
    plus: <path d="M12 4v16M4 12h16" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    mail: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 6 9 7 9-7" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.book}
    </svg>
  );
}

export function CompassMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="m23 9-4 10-10 4 4-10z"
        fill="currentColor"
        fillOpacity=".15"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m23 9-10 4 6 6z" fill="currentColor" />
    </svg>
  );
}

export function CompassLogo() {
  return (
    <Link
      className={styles.logo}
      href="/"
      aria-label="HaUI Compass — go to homepage"
    >
      <CompassMark />
      <span>
        HaUI <strong>Compass</strong>
      </span>
    </Link>
  );
}

export function CompassPreferences() {
  const { ready, language, setLanguage, theme, toggleTheme } = usePreferences();
  return (
    <div className={styles.controls}>
      <div
        className={styles.language}
        role="radiogroup"
        aria-label={language === "vi" ? "Chọn ngôn ngữ" : "Select language"}
      >
        {(["vi", "en"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            disabled={!ready}
            aria-checked={language === value}
            className={language === value ? styles.selectedLanguage : ""}
            onClick={() => setLanguage(value)}
          >
            {value.toUpperCase()}
          </button>
        ))}
      </div>
      <button
        className={styles.themeButton}
        role="switch"
        disabled={!ready}
        aria-checked={theme === "dark"}
        aria-label={
          theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
        }
        onClick={toggleTheme}
      >
        <CIcon name={theme === "dark" ? "moon" : "sun"} size={18} />
      </button>
    </div>
  );
}

export function BrowserFrame({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { language } = usePreferences();
  return (
    <div className={`${styles.browserFrame} ${className}`}>
      <div className={styles.browserBar}>
        <span />
        <span />
        <span />
        <code>
          HaUI Compass ·{" "}
          {language === "vi" ? "Ví dụ minh họa" : "Illustrative preview"}
        </code>
      </div>
      <div className={styles.browserBody}>{children}</div>
    </div>
  );
}

export function PanelTitle({
  icon,
  children,
}: {
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <h3 className={styles.panelTitle}>
      <span className={styles.iconTile}>
        <CIcon name={icon} size={23} />
      </span>
      {children}
    </h3>
  );
}
