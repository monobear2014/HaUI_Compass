import { NextRequest } from "next/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { getUploadIntentStatus } from "@/lib/document-upload-lifecycle";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const status = await getUploadIntentStatus(user.id, (await params).id);
    if (!status) return Response.json({ error: "not_found" }, { status: 404 });
    return Response.json(status, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "upload_status_unavailable" }, { status: 503 });
  }
}
