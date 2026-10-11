import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import { retryDocumentStorageCleanup } from "@/lib/document-store";

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
    const deleted = await retryDocumentStorageCleanup(user.id, (await params).id);
    return Response.json(
      { deleted },
      { status: deleted ? 200 : 404, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json({ error: "cleanup_unavailable" }, { status: 503 });
  }
}
