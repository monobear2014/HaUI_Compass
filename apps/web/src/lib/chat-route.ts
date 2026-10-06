import "server-only";
import type { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "./demo-auth";
import { DocumentError } from "./document-store";

export async function chatRoute(
  request: NextRequest,
  action: (owner: string) => unknown | Promise<unknown>,
) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
    if (!user) throw new DocumentError("unauthorized", 401);
    if (request.method !== "GET" && !sameOrigin(request))
      throw new DocumentError("invalid_origin", 403);
    return Response.json(await action(user.id), {
      status: request.method === "POST" ? 201 : 200,
      headers,
    });
  } catch (error) {
    if (error instanceof DocumentError)
      return Response.json(
        { error: error.code },
        { status: error.status, headers },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { error: "invalid_input" },
        { status: 400, headers },
      );
    console.error("Compass chat request failed");
    return Response.json({ error: "unavailable" }, { status: 503, headers });
  }
}
// Bound streamed JSON as well as Content-Length.
export async function readChatInput(
  request: NextRequest,
): Promise<Record<string, unknown>> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new DocumentError("invalid_input", 400);
  const reader = request.body?.getReader();
  if (!reader) throw new DocumentError("invalid_input", 400);
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 16000) {
        await reader.cancel();
        throw new DocumentError("payload_too_large", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const input: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new DocumentError("invalid_input", 400);
  return input as Record<string, unknown>;
}
