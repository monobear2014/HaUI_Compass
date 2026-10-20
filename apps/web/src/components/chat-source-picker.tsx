"use client";
import { useEffect, useRef, useState } from "react";
import type { StudyDocument } from "@/lib/documents";
import styles from "./companion-rail.module.css";

export function ChatSourcePicker({
  value,
  onChange,
  documents,
  vi,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  documents: StudyDocument[];
  vi: boolean;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [remoteDocuments, setRemoteDocuments] = useState<StudyDocument[]>([]);
  const [searchError, setSearchError] = useState(false);
  useEffect(() => {
    if (!query.trim()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/documents?q=${encodeURIComponent(query.trim())}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("search_unavailable");
          const result = await response.json();
          if (controller.signal.aborted) return;
          setSearchError(false);
          setRemoteDocuments((old) => [
            ...new Map(
              [...old, ...result.documents].map((doc) => [doc.id, doc]),
            ).values(),
          ]);
        })
        .catch(() => {
          if (!controller.signal.aborted) setSearchError(true);
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const root = useRef<HTMLDetailsElement>(null);
  const courses = [
    ["ai", "AI"],
    ["ml", "Machine Learning"],
    ["la", vi ? "Đại số tuyến tính" : "Linear algebra"],
    ["stats", vi ? "Xác suất thống kê" : "Probability"],
    ["automation", vi ? "Tự động hoá" : "Automatic control"],
    ["db", vi ? "CSDL · mô phỏng" : "Databases · demo"],
    ["se", vi ? "CNPM · mô phỏng" : "Software engineering · demo"],
  ];
  const sources = [
    ...[
      ...new Map(
        [...remoteDocuments, ...documents].map((doc) => [doc.id, doc]),
      ).values(),
    ].map((doc) => ({
      id: `document:${doc.id}`,
      name: doc.name,
      private: true,
      ready: !doc.ingestionStatus || doc.ingestionStatus === "ready",
    })),
    ...courses.map(([id, name]) => ({ id, name, private: false, ready: true })),
  ];
  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase();
  const visible = sources.filter((row) =>
    normalize(row.name).includes(normalize(query.trim())),
  );
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node) && root.current)
        root.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <div className={styles.sourceField}>
      <span>{vi ? "Môn / tài liệu" : "Course / material"}</span>
      <details
        ref={root}
        className={styles.sourcePicker}
        onKeyDown={(event) => {
          if (event.key === "Escape" && root.current) {
            root.current.open = false;
            root.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary
          aria-disabled={disabled}
          onClick={(event) => {
            if (disabled) event.preventDefault();
          }}
          title={sources.find((row) => row.id === value)?.name}
        >
          <span>
            {sources.find((row) => row.id === value)?.name ||
              (vi ? "Chọn tài liệu" : "Choose material")}
          </span>
          <span aria-hidden="true">⌄</span>
        </summary>
        <div className={styles.sourceMenu}>
          <input
            type="search"
            aria-label={
              vi ? "Tìm môn học hoặc tài liệu" : "Search courses or materials"
            }
            placeholder={
              vi ? "Tìm môn học, tên tài liệu…" : "Search courses or files…"
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {searchError && (
            <p role="status">
              {vi
                ? "Chưa tải được kết quả tìm kiếm. Hãy thử lại."
                : "Could not load search results. Try again."}
            </p>
          )}
          {[true, false].map((privateSource) => (
            <section key={String(privateSource)}>
              <h3>
                {privateSource
                  ? vi
                    ? "Tài liệu của bạn"
                    : "Your uploads"
                  : vi
                    ? "Học liệu theo môn"
                    : "Courseware"}
              </h3>
              {visible
                .filter((row) => row.private === privateSource)
                .map((row) => (
                  <button
                    type="button"
                    key={row.id}
                    disabled={disabled || !row.ready}
                    aria-pressed={value === row.id}
                    title={row.name}
                    onClick={() => {
                      onChange(row.id);
                      if (root.current) root.current.open = false;
                    }}
                  >
                    <span>{row.name}</span>
                    {!row.ready && (
                      <small>{vi ? "Chưa sẵn sàng" : "Not ready"}</small>
                    )}
                  </button>
                ))}
              {!visible.some((row) => row.private === privateSource) && (
                <p>
                  {vi ? "Không có tài liệu phù hợp." : "No matching materials."}
                </p>
              )}
            </section>
          ))}
        </div>
      </details>
    </div>
  );
}
