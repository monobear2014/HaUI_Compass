import { NextRequest } from "next/server";
import { attachDocumentContext } from "@/lib/companion-document-context";
import { DocumentError } from "@/lib/document-store";
import { clearLegacyChatHistory } from "@/lib/compass-chat-store";
import { isLecturer } from "@/lib/lecturer-access";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import {
  isJsonMediaType,
  resolveCompassApiUrl,
} from "@/lib/compass-api-config";

export const runtime = "nodejs";
export const maxDuration = 60;

async function forward(
  request: NextRequest,
  context: RouteContext<"/compass-api/[...path]">,
) {
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user)
    return Response.json(
      { error: { code: "unauthorized", message: "Please sign in again." } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  if (!["GET", "HEAD"].includes(request.method) && !sameOrigin(request))
    return Response.json(
      {
        error: { code: "invalid_origin", message: "Request origin rejected." },
      },
      { status: 403 },
    );
  const { path } = await context.params;
  if (
    path.some(
      (segment) =>
        !/^[a-zA-Z0-9_.-]+$/.test(segment) ||
        segment === "." ||
        segment === "..",
    )
  )
    return Response.json({ error: { code: "invalid_path" } }, { status: 400 });
  if (isLecturer(user.id) && path[0] !== "lecturer")
    return Response.json(
      { error: { code: "forbidden_role" } },
      { status: 403 },
    );
  // Server-to-server routes are never reachable from the browser, and this proxy
  // attaches the service key, so it must not forward to them at all.
  if (path[0] === "internal")
    return Response.json({ error: { code: "forbidden" } }, { status: 403 });
  if (path.join("/") === "companion/import-document-history")
    return Response.json({ error: { code: "forbidden" } }, { status: 403 });
  const target = new URL(
    `/api/v1/${path.map(encodeURIComponent).join("/")}`,
    resolveCompassApiUrl(),
  );
  target.search = request.nextUrl.search;
  try {
    let body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 10 * 1024 * 1024)
      return Response.json(
        { error: { code: "payload_too_large" } },
        { status: 413 },
      );
    if (
      body?.byteLength &&
      !isJsonMediaType(request.headers.get("content-type"))
    )
      return Response.json(
        { error: { code: "unsupported_media_type" } },
        { status: 415 },
      );
    // The API trusts the account only together with the shared service key, so a
    // browser can never choose whose learning data it reads or writes.
    const serviceKey = process.env.COMPASS_SERVICE_KEY;
    if (
      request.method === "POST" &&
      path.join("/") === "companion/messages" &&
      body
    ) {
      const input = JSON.parse(new TextDecoder().decode(body));
      if (!input || typeof input !== "object" || Array.isArray(input))
        return Response.json(
          { error: { code: "invalid_input" } },
          { status: 400 },
        );
      await attachDocumentContext(user.id, input, async (id) => {
        if (!/^[a-f0-9-]{36}$/i.test(id))
          throw new DocumentError("invalid_input", 400);
        const history = await fetch(
          new URL(`/api/v1/companion/conversations/${id}`, target),
          {
            headers: {
              "X-Compass-User": user.id,
              "X-Compass-Service-Key": serviceKey || "",
            },
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
          },
        );
        if (!history.ok)
          throw new DocumentError("conversation_unavailable", history.status);
        return history.json();
      });
      body = new TextEncoder().encode(JSON.stringify(input)).buffer;
    }
    const response = await fetch(target, {
      method: request.method,
      headers: {
        // Only JSON is forwarded, in its canonical form; the API still re-checks it.
        "Content-Type": "application/json",
        "X-Compass-User": user.id,
        ...(serviceKey ? { "X-Compass-Service-Key": serviceKey } : {}),
      },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    if (
      response.ok &&
      request.method === "DELETE" &&
      path.join("/") === "companion/history"
    )
      await clearLegacyChatHistory(user.id);
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DocumentError)
      return Response.json(
        { error: { code: error.code } },
        { status: error.status },
      );
    if (error instanceof SyntaxError)
      return Response.json(
        { error: { code: "invalid_input" } },
        { status: 400 },
      );
    return Response.json(
      {
        error: {
          code: "unavailable",
          message: "Learning API unavailable. Please retry.",
        },
      },
      { status: 503 },
    );
  }
}

export {
  forward as GET,
  forward as POST,
  forward as PUT,
  forward as PATCH,
  forward as DELETE,
};
