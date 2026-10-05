"use client";

import { FormEvent, useState } from "react";
import { usePreferences } from "@/components/preferences";
import { api } from "@/lib/api";

type Scope = "institutional" | "course";
type CourseId = "db" | "ml" | "se";
type Citation = {
  citation_id: string;
  document_id: string;
  chunk_id: string;
  title: string;
  source_url: string | null;
  local_path: string;
  source_type: "official_public" | "fictional_demo";
  source_label: "Nguồn công khai HaUI" | "Tài liệu môn học demo";
  page: number | null;
  section: string | null;
};
type KnowledgeAnswer = {
  answer: string;
  status: "answered" | "abstained";
  citations: Citation[];
  retrieval: {
    source_count: number;
    chunk_count: number;
    strategy: "lexical" | "embedding";
  };
  source: "ai" | "template";
  fallback_reason: string | null;
};

const suggestions: Record<CourseId, string> = {
  db: "Database Mini Project cần nộp những gì?",
  ml: "MAE và RMSE được sử dụng thế nào trong tài liệu?",
  se: "Project yêu cầu testing những gì?",
};

export default function KnowledgePage() {
  const { language } = usePreferences();
  const [scope, setScope] = useState<Scope>("course");
  const [course, setCourse] = useState<CourseId>("db");
  const [question, setQuestion] = useState(suggestions.db);
  const [result, setResult] = useState<KnowledgeAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const vi = language === "vi";

  function chooseScope(value: Scope) {
    setScope(value);
    setResult(null);
    setQuestion(
      value === "institutional"
        ? "HaUI có các cấp trình độ đào tạo nào?"
        : suggestions[course],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await api<KnowledgeAnswer>("knowledge/query", {
          question,
          scope,
          course_id: scope === "course" ? course : null,
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : vi
            ? "Không thể truy vấn tài liệu."
            : "Could not query the documents.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="knowledge-page">
      <header className="page-header">
        <span className="eyebrow">
          {vi ? "TÀI LIỆU · CÓ DẪN NGUỒN" : "KNOWLEDGE · CITED"}
        </span>
        <h1>{vi ? "Tài liệu & hỏi đáp" : "Documents & Q&A"}</h1>
        <p>
          {vi
            ? "Mỗi câu hỏi độc lập. Hệ thống chỉ trả lời từ tài liệu đã retrieve và sẽ từ chối khi bằng chứng chưa đủ."
            : "Each question is independent. Answers use retrieved documents only and abstain when evidence is insufficient."}
        </p>
      </header>

      <section
        className="panel knowledge-query"
        aria-label={vi ? "Hỏi từ tài liệu" : "Ask documents"}
      >
        <div
          className="scope-tabs"
          role="group"
          aria-label={vi ? "Phạm vi nguồn" : "Source scope"}
        >
          <button
            type="button"
            className={scope === "institutional" ? "active" : "secondary"}
            aria-pressed={scope === "institutional"}
            onClick={() => chooseScope("institutional")}
          >
            HaUI
          </button>
          <button
            type="button"
            className={scope === "course" ? "active" : "secondary"}
            aria-pressed={scope === "course"}
            onClick={() => chooseScope("course")}
          >
            {vi ? "Môn học demo" : "Demo course"}
          </button>
        </div>

        <form onSubmit={submit}>
          {scope === "course" && (
            <label>
              {vi ? "Môn học" : "Course"}
              <select
                value={course}
                onChange={(event) => {
                  const selected = event.target.value as CourseId;
                  setCourse(selected);
                  setQuestion(suggestions[selected]);
                  setResult(null);
                }}
              >
                <option value="db">Cơ sở dữ liệu</option>
                <option value="ml">Machine Learning</option>
                <option value="se">Software Engineering</option>
              </select>
            </label>
          )}
          <label>
            {vi ? "Câu hỏi" : "Question"}
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              minLength={3}
              maxLength={500}
              rows={3}
              required
            />
          </label>
          <button disabled={loading} type="submit">
            {loading
              ? vi
                ? "Đang tìm trong tài liệu…"
                : "Searching documents…"
              : vi
                ? "Hỏi từ tài liệu"
                : "Ask documents"}
          </button>
        </form>
        <p className="fine-print">
          {scope === "institutional"
            ? vi
              ? "Chỉ tìm trong snapshot nguồn công khai HaUI; cần kiểm tra lại tính hiện hành tại URL gốc."
              : "Searches public HaUI snapshots only; recheck current applicability at the source URL."
            : vi
              ? "Course pack hư cấu phục vụ demo, không phải tài liệu chính thức HaUI."
              : "Fictional demo course packs, not official HaUI material."}
        </p>
      </section>

      {error && (
        <div className="message error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <section
          className={`panel knowledge-answer ${result.status}`}
          aria-live="polite"
          data-testid="knowledge-answer"
        >
          <div className="answer-heading">
            <div>
              <span className="eyebrow">
                {result.status === "answered"
                  ? vi
                    ? "TRẢ LỜI CÓ CĂN CỨ"
                    : "GROUNDED ANSWER"
                  : vi
                    ? "CHƯA ĐỦ BẰNG CHỨNG"
                    : "INSUFFICIENT EVIDENCE"}
              </span>
              <h2>
                {result.status === "answered"
                  ? vi
                    ? "Trả lời"
                    : "Answer"
                  : vi
                    ? "Từ chối trả lời"
                    : "Abstained"}
              </h2>
            </div>
            <span className="badge">
              {result.source === "ai"
                ? "AI · online"
                : vi
                  ? "Mẫu · offline"
                  : "Template · offline"}
            </span>
          </div>
          <p className="answer-text">{result.answer}</p>
          <p className="fine-print">
            {result.retrieval.chunk_count} chunks ·{" "}
            {result.retrieval.source_count} sources ·{" "}
            {result.retrieval.strategy === "lexical"
              ? "lexical fallback"
              : "embedding"}
          </p>

          {result.citations.length > 0 && (
            <div className="citations">
              <h3>{vi ? "Nguồn" : "Sources"}</h3>
              <ol>
                {result.citations.map((citation) => (
                  <li key={citation.citation_id}>
                    <details>
                      <summary>
                        <strong>{citation.title}</strong>
                        <span
                          className={`source-badge ${citation.source_type}`}
                        >
                          {citation.source_label}
                        </span>
                      </summary>
                      <p>
                        {citation.section && (
                          <span>
                            {vi ? "Mục" : "Section"}: {citation.section}
                            <br />
                          </span>
                        )}
                        {citation.page && (
                          <span>
                            {vi ? "Trang" : "Page"}: {citation.page}
                            <br />
                          </span>
                        )}
                        <code>{citation.local_path}</code>
                      </p>
                      {citation.source_url && (
                        <a
                          href={citation.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {vi ? "Mở nguồn công khai" : "Open public source"}
                        </a>
                      )}
                    </details>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
