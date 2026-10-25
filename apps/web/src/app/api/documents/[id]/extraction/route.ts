import { NextRequest } from "next/server";
import { getSessionUser, SESSION_COOKIE } from "@/lib/demo-auth";
import { extractedDocumentPages } from "@/lib/document-extracted-text";

export const runtime = "nodejs";
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  const headers = { "Cache-Control": "no-store" };
  if (!user)
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const pages = await extractedDocumentPages(
    user.id,
    (await context.params).id,
  );
  if (!pages)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json({ pages }, { headers });
}
