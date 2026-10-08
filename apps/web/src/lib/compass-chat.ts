import "server-only";
import { appendFileSync } from "node:fs";
import { DocumentError, findDocument } from "./document-store";
import {
  authorizeSession,
  beginTurn,
  failTurn,
  finishTurn,
  getChatMessages,
} from "./compass-chat-store";
import { SqliteDocumentRetriever } from "./document-retriever";
import { resolveRetrievalQuery } from "./document-ranking.cjs";

const REFUSAL =
  "Mình chưa tìm thấy đủ thông tin trong tài liệu hiện tại để trả lời chắc chắn câu hỏi này.";
export async function sendChatMessage(
  owner: string,
  sessionId: string,
  input: {
    message: string;
    active_document_id?: string;
    request_id: string;
  },
) {
  const requestStarted = performance.now();
  const session = authorizeSession(owner, sessionId);
  const active = input.active_document_id ?? session.study_set_id;
  if (active !== session.study_set_id)
    throw new DocumentError("not_found", 404);
  const document = findDocument(owner, active, false);
  if (!document) throw new DocumentError("not_found", 404);
  if (document.ingestionStatus !== "ready")
    throw new DocumentError(
      `ingestion_${document.ingestionStatus ?? "pending"}`,
      422,
    );
  const all = getChatMessages(owner, sessionId);
  const history = all
    .filter(
      (row) =>
        row.request_id !== input.request_id &&
        row.status !== "failed" &&
        row.status !== "pending",
    )
    .slice(-8);
  // Resolve follow-ups without allowing old evidence to make an unrelated query match.
  const query = resolveRetrievalQuery(input.message, history);
  const turn = beginTurn(owner, sessionId, input.request_id, input.message);
  if (turn.completed) return all;
  const trace: EvaluationTrace = {
    request_id: input.request_id, resolved_query: query, retrieval_ms: 0,
    generation_ms: 0, end_to_end_ms: 0, provider_call_count: 0, retrieved: [],
  };
  let generationStarted: number | undefined;
  try {
    const retrievalStarted = performance.now();
    const ranked = new SqliteDocumentRetriever().searchWithScores(
      query,
      session.study_set_id,
      owner,
      [active],
    );
    const retrievalMs = performance.now() - retrievalStarted;
    const chunks = ranked.map((item) => item.chunk);
    trace.retrieval_ms = retrievalMs;
    trace.retrieved = ranked.map((item, index) => ({
      rank: index + 1, chunk_id: item.chunk.chunk_id,
      document_id: item.chunk.document_id, heading: item.chunk.heading,
      score: item.score,
      source_ids: [...item.chunk.content.matchAll(/\[SOURCE:([^\]]+)\]/g)].map((m) => m[1]),
    }));
    if (!chunks.length) {
      finishTurn(
        owner,
        sessionId,
        input.request_id,
        turn.token,
        REFUSAL,
        "abstained",
        [],
      );
      return getChatMessages(owner, sessionId);
    }
    const key = process.env.COMPASS_SERVICE_KEY;
    if (!key) throw new DocumentError("assistant_unavailable", 503);
    generationStarted = performance.now();
    trace.provider_call_count = 1;
    const response = await fetch(
      new URL(
        "/api/v1/internal/compass/answer",
        process.env.COMPASS_API_URL || "http://127.0.0.1:8000",
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Compass-Service-Key": key,
          "X-Compass-Request-Id": input.request_id,
        },
        body: JSON.stringify({
          message: input.message,
          evidence: chunks,
          history: history.map((row) => ({
            role: row.role,
            content: row.content.slice(0, 4000),
          })),
        }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) throw new DocumentError("assistant_unavailable", 503);
    const result: unknown = await response.json();
    if (!result || typeof result !== "object")
      throw new DocumentError("invalid_answer", 502);
    const { answer, status, citations } = result as Record<string, unknown>;
    if (
      typeof answer !== "string" ||
      !answer.trim() ||
      answer.length > 16000 ||
      !Array.isArray(citations) ||
      !citations.every((id) => typeof id === "string") ||
      new Set(citations).size !== citations.length ||
      !["answered", "abstained"].includes(String(status))
    )
      throw new DocumentError("invalid_answer", 502);
    const cited = citations.map((id) =>
      chunks.find((row) => row.chunk_id === id),
    );
    if (
      cited.some((row) => !row) ||
      (status === "answered" && !cited.length) ||
      (status === "abstained" && cited.length)
    )
      throw new DocumentError("invalid_citations", 502);
    // Ignore any model-generated inline handles. The UI numbers real persisted sources.
    const content =
      status === "abstained"
        ? REFUSAL
        : answer.replace(/\[(?:c\d+|\d+)\]/g, "").trim();
    finishTurn(
      owner,
      sessionId,
      input.request_id,
      turn.token,
      content,
      status as "answered" | "abstained",
      cited as typeof chunks,
    );
    return getChatMessages(owner, sessionId);
  } catch (error) {
    failTurn(sessionId, input.request_id, turn.token);
    console.error("Compass generation failed", {
      sessionId,
      code: error instanceof DocumentError ? error.code : "unavailable",
    });
    if (error instanceof DocumentError) throw error;
    throw new DocumentError("assistant_unavailable", 503);
  } finally {
    trace.generation_ms = generationStarted === undefined ? 0 : performance.now() - generationStarted;
    trace.end_to_end_ms = performance.now() - requestStarted;
    writeEvaluationTrace(trace);
  }
}

type EvaluationTrace = {
  request_id: string;
  resolved_query: string;
  retrieval_ms: number;
  generation_ms: number;
  end_to_end_ms: number;
  provider_call_count: number;
  retrieved: {
    rank: number;
    chunk_id: string;
    document_id: string;
    heading: string | null;
    score: number;
    source_ids: string[];
  }[];
};

function writeEvaluationTrace(trace: EvaluationTrace) {
  const path = process.env.COMPASS_EVAL_TRACE_PATH;
  if (!path) return;
  // Opt-in benchmark observability only; responses and production behavior are unchanged.
  try {
    appendFileSync(path, `${JSON.stringify(trace)}\n`, { encoding: "utf8" });
  } catch {
    console.warn("Compass evaluation trace unavailable");
  }
}
