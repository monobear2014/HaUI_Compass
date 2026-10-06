import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  authenticate,
  createSession,
  getSessionUser,
  registerUser,
  revokeSession,
  sameOrigin,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/demo-auth";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  context: RouteContext<"/api/auth/[action]">,
) {
  if ((await context.params).action !== "session")
    return NextResponse.json({ error: "not_found" }, { status: 404, headers });
  return NextResponse.json(
    { user: getSessionUser(request.cookies.get(SESSION_COOKIE)?.value) },
    { headers },
  );
}

export async function POST(
  request: NextRequest,
  context: RouteContext<"/api/auth/[action]">,
) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "invalid_origin" },
      { status: 403, headers },
    );
  const { action } = await context.params;
  const previousToken = request.cookies.get(SESSION_COOKIE)?.value;
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.headers.get("origin")!).protocol === "https:",
    path: "/",
    maxAge: SESSION_SECONDS,
  };
  try {
    if (action === "logout") {
      revokeSession(previousToken);
      const response = NextResponse.json({ ok: true }, { headers });
      response.cookies.set(SESSION_COOKIE, "", { ...options, maxAge: 0 });
      return response;
    }
    if (action !== "login" && action !== "register")
      return NextResponse.json(
        { error: "not_found" },
        { status: 404, headers },
      );
    const raw = await request.text();
    if (raw.length > 4096) throw new AuthError("invalid_registration", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AuthError("invalid_input");
    }
    if (
      !body ||
      typeof body.username !== "string" ||
      typeof body.password !== "string" ||
      body.password.length > 128
    )
      throw new AuthError("invalid_input");
    const username = body.username.trim().toLowerCase();
    if (username.length > 32 || !username) throw new AuthError("invalid_input");
    const user =
      action === "login"
        ? await authenticate(username, body.password)
        : await registerUser(
            username,
            body.password,
            typeof body.name === "string" ? body.name.trim() : "",
          );
    const token = createSession(user);
    revokeSession(previousToken);
    const response = NextResponse.json(
      { user },
      { status: action === "register" ? 201 : 200, headers },
    );
    response.cookies.set(SESSION_COOKIE, token, options);
    return response;
  } catch (error) {
    if (error instanceof AuthError)
      return NextResponse.json(
        { error: error.code },
        { status: error.status, headers },
      );
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers },
    );
  }
}
