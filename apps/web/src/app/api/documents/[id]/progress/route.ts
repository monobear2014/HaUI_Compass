import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import {
  getDocumentStudyProgress,
  saveDocumentStudyProgress,
} from "@/lib/document-store";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user)
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  const progress = getDocumentStudyProgress(user.id, (await params).id);
  if (!progress)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json({ progress }, { headers });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user)
    return Response.json({ error: "unauthorized" }, { status: 401, headers });
  if (!sameOrigin(request))
    return Response.json({ error: "invalid_origin" }, { status: 403, headers });
  const body = await request.json().catch(() => null);
  if (
    !body ||
    !Array.isArray(body.covered) ||
    !Array.isArray(body.mastered) ||
    body.covered.length > 12 ||
    body.mastered.length > 12 ||
    [...body.covered, ...body.mastered].some(
      (id) => typeof id !== "string" || !/^topic-\d{1,2}$/.test(id),
    )
  )
    return Response.json({ error: "invalid_input" }, { status: 400, headers });
  const progress = saveDocumentStudyProgress(user.id, (await params).id, body);
  if (!progress)
    return Response.json({ error: "not_found" }, { status: 404, headers });
  return Response.json({ progress }, { headers });
}
