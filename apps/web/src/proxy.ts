import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { safeReturnPath } from "@/lib/auth-navigation";

export function proxy(request: NextRequest) {
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (user) return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set(
    "next",
    request.nextUrl.pathname === "/onboarding" ||
      request.nextUrl.pathname.startsWith("/onboarding/")
      ? safeReturnPath(request.nextUrl.searchParams.get("next"))
      : request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/learn/:path*",
    "/onboarding/:path*",
    "/documents/:path*",
    "/study-set/:path*",
    "/dashboard/:path*",
    "/today/:path*",
    "/plan/:path*",
    "/academic/:path*",
    "/knowledge/:path*",
    "/reflect/:path*",
    "/history/:path*",
  ],
};
