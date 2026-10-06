"use client";

import Link from "next/link";
import { usePreferences } from "../preferences";
import { CIcon, CompassPreferences } from "./primitives";
import styles from "./onboarding.module.css";

function RoleIcon({
  role,
}: {
  role: "student" | "teacher" | "professor" | "parent";
}) {
  if (role === "student") return <CIcon name="grad" size={32} />;
  if (role === "teacher") return <CIcon name="users" size={32} />;
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {role === "professor" ? (
        <>
          <path d="m4 8 8-5 8 5M6 7v14h12V7M6 11H3v10h18V11h-3M10 21v-6h4v6" />
          <circle cx="12" cy="9" r="1.5" />
        </>
      ) : (
        <path d="m3 10 9-7 9 7v11h-6v-8H9v8H3z" />
      )}
    </svg>
  );
}

export function CompassOnboarding({ nextPath }: { nextPath: string }) {
  const { language, theme } = usePreferences();
  const vi = language === "vi";
  const roles = [
    { id: "student", label: vi ? "Sinh viên" : "Student" },
    { id: "teacher", label: vi ? "Giáo viên" : "Teacher" },
    { id: "professor", label: vi ? "Giảng viên" : "Professor" },
    { id: "parent", label: vi ? "Phụ huynh" : "Parent" },
  ] as const;
  return (
    <main className={styles.page} data-theme={theme}>
      <Link
        className={styles.back}
        href={`/login?next=${encodeURIComponent(nextPath)}`}
      >
        <CIcon name="back" size={20} />
        {vi ? "Quay lại" : "Back"}
      </Link>
      <div className={styles.preferences}>
        <CompassPreferences />
      </div>
      <section className={styles.content} aria-labelledby="role-heading">
        <h1 id="role-heading">{vi ? "Tôi là…" : "I'm a…"}</h1>
        <div className={styles.roles}>
          {roles.map((role) => {
            const content = (
              <>
                <span className={styles.icon}>
                  <RoleIcon role={role.id} />
                </span>
                <span className={styles.label}>{role.label}</span>
                {role.id !== "student" && (
                  <span className={styles.soon}>
                    {vi ? "Sắp có" : "Coming soon"}
                  </span>
                )}
              </>
            );
            return role.id === "student" ? (
              <Link
                key={role.id}
                className={styles.card}
                href={`/onboarding/upload?next=${encodeURIComponent(nextPath)}`}
                aria-label={
                  vi
                    ? "Sinh viên — vào không gian học tập"
                    : "Student — enter your study space"
                }
              >
                {content}
              </Link>
            ) : (
              <button
                key={role.id}
                className={styles.card}
                type="button"
                disabled
              >
                {content}
              </button>
            );
          })}
        </div>
      </section>
      <footer className={styles.brand}>HaUI Compass</footer>
    </main>
  );
}
