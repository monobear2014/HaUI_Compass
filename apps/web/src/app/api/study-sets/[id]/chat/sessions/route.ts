import type { NextRequest } from "next/server";
import { chatRoute } from "@/lib/chat-route";
import { createChatSession, listChatSessions } from "@/lib/compass-chat-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export function GET(request: NextRequest, context: Context) {
  return chatRoute(request, async (owner) => ({
    sessions: await listChatSessions(owner, (await context.params).id),
  }));
}
export function POST(request: NextRequest, context: Context) {
  return chatRoute(request, async (owner) => ({
    session: await createChatSession(owner, (await context.params).id),
  }));
}
