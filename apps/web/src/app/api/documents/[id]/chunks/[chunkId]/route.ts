import type { NextRequest } from "next/server";
import { chatRoute } from "@/lib/chat-route";
import { DocumentError } from "@/lib/document-store";
import { findDocumentChunk } from "@/lib/document-retriever";
export const runtime = "nodejs";
export function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; chunkId: string }> },
) {
  return chatRoute(request, async (owner) => {
    const { id, chunkId } = await context.params;
    const chunk = await findDocumentChunk(owner, id, chunkId);
    if (!chunk) throw new DocumentError("not_found", 404);
    return { chunk };
  });
}
