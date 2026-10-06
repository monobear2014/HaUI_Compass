import type { NextRequest } from "next/server";
import { chatRoute, readChatInput } from "@/lib/chat-route";
import { getChatMessages } from "@/lib/compass-chat-store";
import { sendChatMessage } from "@/lib/compass-chat";
import { DocumentError } from "@/lib/document-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function GET(request: NextRequest, context: Context) {
  return chatRoute(request, async (owner) => ({
    messages: getChatMessages(owner, (await context.params).id),
  }));
}
export function POST(request: NextRequest, context: Context) {
  return chatRoute(request, async (owner) => {
    const input = await readChatInput(request);
    if (
      typeof input.message !== "string" ||
      !input.message.trim() ||
      input.message.length > 2000 ||
      typeof input.request_id !== "string" ||
      !/^[a-f0-9-]{36}$/.test(input.request_id) ||
      (input.active_document_id !== undefined &&
        typeof input.active_document_id !== "string")
    )
      throw new DocumentError("invalid_input", 400);
    const messages = await sendChatMessage(owner, (await context.params).id, {
      message: input.message.trim(),
      request_id: input.request_id,
      active_document_id: input.active_document_id as string | undefined,
    });
    return {
      messages,
      message: messages.find(
        (row) =>
          row.request_id === input.request_id && row.role === "assistant",
      ),
      citations:
        messages.find(
          (row) =>
            row.request_id === input.request_id && row.role === "assistant",
        )?.citations ?? [],
    };
  });
}
