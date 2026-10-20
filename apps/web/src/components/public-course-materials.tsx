"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

type Material = {
  slug: string;
  title: string;
  format: string;
  publisher: string;
  authors: string[];
  source_url: string;
  source_page_url: string;
  license: string;
  license_url: string;
  collected_at: string;
  bytes: number;
};
type Reading = Material & {
  content: string;
  page: number | null;
  page_count: number | null;
};

const EMPTY_MATERIALS: Material[] = [];

export function PublicCourseMaterials({
  course,
  vi,
}: {
  course: string;
  vi: boolean;
}) {
  const [list, setList] = useState<{
    course: string;
    materials: Material[];
  } | null>(null);
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reading, setReading] = useState<{
    key: string;
    data?: Reading;
    error?: boolean;
  } | null>(null);
  const [failedCourse, setFailedCourse] = useState("");
  const [attempt, setAttempt] = useState(0);
  const key = `${course}/${selected}/${page}/${attempt}`;
  const materials = list?.course === course ? list.materials : EMPTY_MATERIALS;
  const visibleMaterials = materials.filter((item) =>
    `${item.title} ${item.publisher} ${item.authors.join(" ")}`
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase()),
  );
  useEffect(() => {
    let active = true;
    void api<{ materials: Material[] }>(`knowledge/courses/${course}/materials`)
      .then((result) => {
        if (active) {
          setList({ course, materials: result.materials });
          setFailedCourse("");
        }
      })
      .catch(() => {
        if (active) setFailedCourse(course);
      });
    return () => {
      active = false;
    };
  }, [course, attempt]);
  useEffect(() => {
    if (!selected || !materials.some((item) => item.slug === selected)) return;
    let active = true;
    void api<Reading>(
      `knowledge/courses/${course}/materials/${encodeURIComponent(selected)}?page=${page}`,
    )
      .then((data) => {
        if (active) setReading({ key, data });
      })
      .catch(() => {
        if (active) setReading({ key, error: true });
      });
    return () => {
      active = false;
    };
  }, [course, selected, page, key, materials]);
  // No reader from a previous course survives a course switch.
  const current = reading?.key === key ? reading.data : undefined;
  return (
    <details className="panel public-courseware">
      <summary>
        {vi
          ? "Đọc học liệu công khai · PDF / Markdown"
          : "Read public courseware · PDF / Markdown"}
      </summary>

      {failedCourse === course ? (
        <p role="alert">
          {vi ? "Chưa tải được danh mục." : "Could not load the catalog."}{" "}
          <button onClick={() => setAttempt((value) => value + 1)}>
            {vi ? "Thử lại" : "Retry"}
          </button>
        </p>
      ) : list?.course !== course ? (
        <p role="status">{vi ? "Đang tải học liệu…" : "Loading materials…"}</p>
      ) : !materials.length ? (
        <p>
          {vi
            ? "Môn này hiện dùng bộ dữ liệu mô phỏng. Chọn AI, Machine Learning, đại số tuyến tính, xác suất thống kê hoặc tự động hoá để đọc học liệu công khai."
            : "This course currently uses demo materials. Select AI, Machine Learning, linear algebra, probability or automation for public courseware."}
        </p>
      ) : (
        <>
          <label>
            {vi ? "Tìm trong danh mục" : "Search the catalog"}
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                vi
                  ? "Tên tài liệu, tác giả hoặc nguồn"
                  : "Title, author or publisher"
              }
            />
          </label>
          {search.trim() && (
            <p role="status">
              {visibleMaterials.length} / {materials.length}{" "}
              {vi ? "tài liệu phù hợp" : "matching materials"}
            </p>
          )}
          <label>
            {vi ? "Tài liệu công khai" : "Public material"}
            <select
              aria-label={vi ? "Tài liệu công khai" : "Public material"}
              value={materials.some((m) => m.slug === selected) ? selected : ""}
              onChange={(event) => {
                setSelected(event.target.value);
                setPage(1);
              }}
            >
              <option value="">
                {vi ? "Chọn tài liệu để đọc" : "Select a material"}
              </option>
              {materials
                .filter(
                  (m) => m.slug === selected || visibleMaterials.includes(m),
                )
                .map((m) => (
                  <option value={m.slug} key={m.slug}>
                    {m.format.toUpperCase()} · {m.title}
                  </option>
                ))}
            </select>
          </label>
          <p>
            {materials.length} {vi ? "tài liệu gốc" : "original documents"}
          </p>
          {selected &&
            materials.some((m) => m.slug === selected) &&
            !current &&
            !(reading?.key === key && reading.error) && (
              <p role="status">
                {vi ? "Đang mở tài liệu…" : "Opening material…"}
              </p>
            )}
          {reading?.key === key && reading.error && (
            <p role="alert">
              {vi ? "Chưa mở được tài liệu." : "Could not open material."}{" "}
              <button onClick={() => setAttempt((value) => value + 1)}>
                {vi ? "Thử lại" : "Retry"}
              </button>
            </p>
          )}
          {current && (
            <article aria-label={current.title}>
              <h3>{current.title}</h3>
              <p>
                {current.authors.join(", ")} · {current.publisher}
              </p>
              <p>
                <a
                  href={current.source_page_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {vi ? "Trang nguồn" : "Source page"}
                </a>{" "}
                ·{" "}
                <a
                  href={
                    current.source_url +
                    (current.page ? `#page=${current.page}` : "")
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {vi ? "Mở / tải bản gốc" : "Open / download original"}
                </a>{" "}
                ·{" "}
                <a href={current.license_url} target="_blank" rel="noreferrer">
                  {current.license}
                </a>
              </p>
              <p>
                {vi ? "Lấy ngày" : "Retrieved"}:{" "}
                {new Date(current.collected_at).toLocaleDateString(
                  vi ? "vi-VN" : "en-GB",
                  { timeZone: "Asia/Ho_Chi_Minh" },
                )}{" "}
                · {Math.ceil(current.bytes / 1024)} KB ·{" "}
                {vi ? "Nội dung gốc không chỉnh sửa" : "Unmodified source"}
              </p>
              {current.page_count && (
                <label>
                  {vi ? "Trang PDF" : "PDF page"}
                  <select
                    aria-label={vi ? "Trang PDF" : "PDF page"}
                    value={page}
                    onChange={(event) => setPage(Number(event.target.value))}
                  >
                    {Array.from({ length: current.page_count }, (_, i) => (
                      <option value={i + 1} key={i}>
                        {i + 1} / {current.page_count}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <pre className="public-material-text">
                {current.content ||
                  (vi
                    ? "Trang không có văn bản trích xuất; hãy mở PDF gốc."
                    : "No extracted text on this page; open the original PDF.")}
              </pre>
            </article>
          )}
        </>
      )}
    </details>
  );
}
