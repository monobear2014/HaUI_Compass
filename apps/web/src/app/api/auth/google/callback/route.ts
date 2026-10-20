import { NextRequest, NextResponse } from "next/server";
import {
  createSession,
  getOrCreateGoogleUser,
  revokeSession,
  SESSION_COOKIE,
  SESSION_SECONDS,
} from "@/lib/demo-auth";
import {
  googleAuthConfiguration,
  isGoogleAuthOrigin,
} from "@/lib/google-auth-config";
import {
  googleClient,
  googleIdentity,
  readGoogleFlow,
} from "@/lib/google-oauth";
import { isLecturer } from "@/lib/lecturer-access";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = googleAuthConfiguration();
  const secure = new URL(request.url).protocol === "https:";
  const cookie = secure ? "__Host-compass_google" : "compass_google";
  const finish = (path: string) => {
    const response = NextResponse.redirect(
      new URL(path, config?.origin || request.url),
    );
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(cookie, "", {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
    return response;
  };
  if (!config || !isGoogleAuthOrigin(request, config.origin))
    return finish("/login?error=google_unavailable");
  const flow = readGoogleFlow(
    request.cookies.get(cookie)?.value,
    request.nextUrl.searchParams.get("state"),
  );
  const code = request.nextUrl.searchParams.get("code");
  if (
    !flow ||
    !code ||
    code.length > 4096 ||
    request.nextUrl.searchParams.has("error")
  )
    return finish("/login?error=google_failed");
  try {
    const client = googleClient(config);
    const { tokens } = await client.getToken({
      code,
      codeVerifier: flow.verifier,
    });
    if (!tokens.id_token) throw new Error("missing_google_identity");
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: config.clientId,
    });
    const identity = googleIdentity(ticket.getPayload(), flow.nonce);
    const user = await getOrCreateGoogleUser(identity.subject, identity.name);
    const token = await createSession(user);
    await revokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = finish(isLecturer(user.id) ? "/lecturer" : flow.next);
    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return response;
  } catch {
    // Provider/driver errors can contain codes, tokens and client credentials.
    return finish("/login?error=google_failed");
  }
}
