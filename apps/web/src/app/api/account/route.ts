import { NextRequest, NextResponse } from "next/server";
import {
  accountDetails,
  AuthError,
  getSessionUser,
  sameOrigin,
  SESSION_COOKIE,
  updateAccountProfile,
} from "@/lib/demo-auth";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
export async function GET(request: NextRequest) {
  try {
    const user = await getSessionUser(
      request.cookies.get(SESSION_COOKIE)?.value,
    );
    if (!user)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers },
      );
    return NextResponse.json(await accountDetails(user), { headers });
  } catch {
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers },
    );
  }
}
export async function PATCH(request: NextRequest) {
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
    if (raw.length > 4096) throw new AuthError("invalid_profile", 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new AuthError("invalid_profile");
    }
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some(
        (k) => !["name", "birth_date", "major", "bio"].includes(k),
      )
    )
      throw new AuthError("invalid_profile");
    if (
      typeof body.name !== "string" ||
      typeof body.major !== "string" ||
      typeof body.bio !== "string" ||
      (body.birth_date !== null && typeof body.birth_date !== "string")
    )
      throw new AuthError("invalid_profile");
    const name = body.name.trim(),
      major = body.major.trim(),
      bio = body.bio.trim(),
      birth = body.birth_date || null;
    if (
      name.length < 2 ||
      name.length > 60 ||
      major.length > 120 ||
      bio.length > 400 ||
      /[\u0000-\u001f\u007f]/.test(name + major)
    )
      throw new AuthError("invalid_profile");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    if (
      birth &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(birth) ||
        !Number.isFinite(Date.parse(birth)) ||
        new Date(birth).toISOString().slice(0, 10) !== birth ||
        birth < "1900-01-01" ||
        birth > today)
    )
      throw new AuthError("invalid_birth_date");
    const updated = await updateAccountProfile(user, name, {
      birth_date: birth,
      major,
      bio,
    });
    return NextResponse.json(await accountDetails(updated), { headers });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof AuthError ? error.code : "unavailable" },
      { status: error instanceof AuthError ? error.status : 503, headers },
    );
  }
}
