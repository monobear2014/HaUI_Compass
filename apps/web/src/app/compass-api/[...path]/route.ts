import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";

export const runtime = "nodejs";

async function forward(
  request: NextRequest,
  context: RouteContext<"/compass-api/[...path]">,
) {
  if (!getSessionUser(request.cookies.get(SESSION_COOKIE)?.value))
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
  const target = new URL(
    `/api/v1/${path.map(encodeURIComponent).join("/")}`,
    process.env.COMPASS_API_URL || "http://127.0.0.1:8000",
  );
  target.search = request.nextUrl.search;
  try {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.arrayBuffer();
    if (body && body.byteLength > 10 * 1024 * 1024)
      return Response.json(
        { error: { code: "payload_too_large" } },
        { status: 413 },
      );
    const response = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type":
          request.headers.get("content-type") || "application/json",
      },
      body,
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(60_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") || "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
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
