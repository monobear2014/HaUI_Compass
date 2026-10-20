import { NextRequest, NextResponse } from "next/server";
import {
  AuthError,
  changeAccountPassword,
  getSessionUser,
  sameOrigin,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/demo-auth";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: NextRequest) {
  if (!sameOrigin(request))
    return NextResponse.json(
      { error: "invalid_origin" },
      { status: 403, headers },
    );
  try {
    const user = await getSessionUser(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (!user)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers },
      );
    const raw = await request.text();
    if (raw.length > 1024) throw new AuthError("invalid_password", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AuthError("invalid_password");
    }
    if (
      !body ||
      Object.keys(body).some(
        (k) => !["current_password", "new_password"].includes(k),
      ) ||
      typeof body.current_password !== "string" ||
      typeof body.new_password !== "string" ||
      body.current_password.length > 128 ||
      body.new_password.length < 8 ||
      body.new_password.length > 128
    )
      throw new AuthError("invalid_password");
    const token = await changeAccountPassword(
      user,
      body.current_password,
      body.new_password,
    );
    const response = NextResponse.json({ ok: true }, { headers });
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(request.headers.get("origin")!).protocol === "https:",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.code : "unavailable" },
      { status: error instanceof AuthError ? error.status : 503, headers },
    );
  }
}
