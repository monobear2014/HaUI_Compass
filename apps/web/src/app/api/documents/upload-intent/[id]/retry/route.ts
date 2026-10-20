import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import { retryUploadIntent } from "@/lib/document-upload-lifecycle";
import { DocumentError } from "@/lib/document-store";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!sameOrigin(request))
    return Response.json({ error: "invalid_origin" }, { status: 403 });
  try {
    const status = await retryUploadIntent(user.id, (await params).id);
    if (!status) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof DocumentError)
      return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "upload_retry_unavailable" }, { status: 503 });
  }
}
