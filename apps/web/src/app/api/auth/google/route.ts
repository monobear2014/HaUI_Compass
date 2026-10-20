import { NextRequest, NextResponse } from "next/server";
import {
  googleAuthConfiguration,
  isGoogleAuthOrigin,
} from "@/lib/google-auth-config";
import {
  GOOGLE_FLOW_SECONDS,
  googleAuthorizationUrl,
  googleClient,
  newGoogleFlow,
} from "@/lib/google-oauth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = googleAuthConfiguration();
  if (!config) {
    return NextResponse.redirect(
      new URL("/login?error=google_unavailable", request.url),
    );
  }
  if (!isGoogleAuthOrigin(request, config.origin)) {
    const canonical = new URL("/api/auth/google", config.origin);
    canonical.searchParams.set(
      "next",
      request.nextUrl.searchParams.get("next") || "/learn",
    );
    return NextResponse.redirect(canonical);
  }
  const flow = newGoogleFlow(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(
    googleAuthorizationUrl(googleClient(config), flow),
  );
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  const secure = config.origin.startsWith("https:");
  response.cookies.set(
    secure ? "__Host-compass_google" : "compass_google",
    Buffer.from(JSON.stringify(flow)).toString("base64url"),
    {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: GOOGLE_FLOW_SECONDS,
    },
  );
  return response;
}
