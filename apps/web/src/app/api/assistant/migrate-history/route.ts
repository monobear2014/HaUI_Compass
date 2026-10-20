import { NextRequest } from "next/server";
import { chatRoute } from "@/lib/chat-route";
import { DocumentError } from "@/lib/document-store";
import {
  listLegacyChatSessions,
  getChatMessages,
} from "@/lib/compass-chat-store";
import { resolveCompassApiUrl } from "@/lib/compass-api-config";

export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(request: NextRequest) {
  return chatRoute(request, async (owner) => {
    const key = process.env.COMPASS_SERVICE_KEY;
    if (!key) throw new DocumentError("unavailable", 503);
    let imported = 0;
    const headers = {
      "Content-Type": "application/json",
      "X-Compass-Service-Key": key,
      "X-Compass-User": owner,
    };
    for (const session of await listLegacyChatSessions(owner)) {
      const target = resolveCompassApiUrl();
      const existing = await fetch(
        new URL(`/api/v1/companion/conversations/${session.id}`, target),
        { headers, cache: "no-store", signal: AbortSignal.timeout(10000) },
      );
      if (existing.ok) continue;
      if (existing.status !== 404)
        throw new DocumentError("history_unavailable", 503);
      const messages = await getChatMessages(owner, session.id);
      const exchanges = messages
        .filter((row) => row.role === "user")
        .map((row) => {
          const reply = messages.find(
            (answer) =>
              answer.role === "assistant" &&
              answer.request_id === row.request_id,
          );
          return {
            identifier: row.request_id,
            question: row.content,
            created_at: row.created_at,
            answer: reply?.content || "Tin nhắn này chưa có câu trả lời.",
            citations: (reply?.citations || []).map((citation) => ({
              title: citation.filename,
              source_url: `/study-set/${citation.document_id}?chunk=${citation.chunk_id}`,
              page: citation.page_number,
              section: citation.heading,
              source_type: "uploaded_private",
            })),
          };
        });
      if (!exchanges.length) continue;
      const result = await fetch(
        new URL("/api/v1/companion/import-document-history", target),
        {
          method: "POST",
          headers,
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            identifier: session.id,
            document_id: session.study_set_id,
            created_at: session.created_at,
            exchanges,
          }),
        },
      );
      if (!result.ok) throw new DocumentError("history_unavailable", 503);
      imported++;
    }
    return { imported };
  });
}
