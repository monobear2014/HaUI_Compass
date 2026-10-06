import "server-only";
import { DocumentError, findDocument } from "./document-store";
import {
  authorizeSession,
  beginTurn,
  failTurn,
  finishTurn,
  getChatMessages,
} from "./compass-chat-store";
import { documentIntent, SqliteDocumentRetriever } from "./document-retriever";

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
  let query = input.message;
  // Resolve follow-ups and short answers to a quiz without allowing old evidence
  // to turn an unrelated question into a matching retrieval.
  const refersBack = (text: string) =>
    /\b(its|it|why)\b/i.test(text) || /(?:nó|đó|vậy|tiếp tục)/i.test(text);
  const followUp =
    refersBack(query) ||
    (history.at(-1)?.role === "assistant" &&
      /\?\s*$/.test(history.at(-1)!.content));
  if (followUp && history.length && !documentIntent(query)) {
    const recentQuestion =
      history.findLast((row) => row.role === "user" && !refersBack(row.content))
        ?.content ??
      history.findLast((row) => row.role === "user")?.content ??
      "";
    // Generic quiz requests are broad intents, even when the student answer is short.
    query = documentIntent(recentQuestion)
      ? recentQuestion
      : `${query} ${recentQuestion}`;
  }
  const turn = beginTurn(owner, sessionId, input.request_id, input.message);
  if (turn.completed) return all;
  try {
    const chunks = new SqliteDocumentRetriever().search(
      query,
      session.study_set_id,
      owner,
      [active],
    );
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
  }
}
