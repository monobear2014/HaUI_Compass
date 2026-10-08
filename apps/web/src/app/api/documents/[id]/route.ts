import { NextRequest } from "next/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { findDocument } from "@/lib/document-store";

export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user)
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const doc = findDocument(user.id, (await params).id);
  if (!doc)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  return new Response(new Uint8Array(doc.content), {
    headers: {
      ...headers,
      "Content-Type":
        doc.kind === "pdf" ? "application/pdf" : "text/plain; charset=utf-8",
      "Content-Disposition": `inline; filename="document.${doc.kind === "pdf" ? "pdf" : "txt"}"`,
      "Content-Security-Policy":
        "default-src 'none'; frame-ancestors 'self'; sandbox",
    },
  });
}
