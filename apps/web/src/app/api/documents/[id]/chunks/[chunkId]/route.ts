import type { NextRequest } from "next/server";
import { chatRoute } from "@/lib/chat-route";
import { documentDatabase, DocumentError } from "@/lib/document-store";
export const runtime = "nodejs";
export function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; chunkId: string }> },
) {
  return chatRoute(request, async (owner) => {
    const { id, chunkId } = await context.params;
    const chunk = documentDatabase()
      .prepare(
        `SELECT c.id, c.content, c.heading, c.start_offset, c.end_offset, c.page_number
      FROM document_chunks c JOIN documents d ON d.id = c.document_id
      WHERE d.owner = ? AND d.id = ? AND c.id = ?`,
      )
      .get(owner, id, chunkId);
    if (!chunk) throw new DocumentError("not_found", 404);
    return { chunk };
  });
}
