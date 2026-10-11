import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import {
  createUploadIntents,
  type UploadIntent,
} from "@/lib/document-upload-lifecycle";
import { isWebPostgresConfigured } from "@/lib/web-database";
import { resolveDocumentStorageConfiguration } from "@/lib/document-storage-config";
import { DocumentError } from "@/lib/document-store";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };

function failure(error: string, status: number) {
  return Response.json({ error }, { status, headers });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return failure("unauthorized", 401);
  if (!sameOrigin(request)) return failure("invalid_origin", 403);

  let body: { files?: unknown };
  try {
    body = (await request.json()) as { files?: unknown };
  } catch {
    return failure("invalid_input", 400);
  }
  if (!Array.isArray(body.files)) return failure("invalid_input", 400);
  if (!isWebPostgresConfigured())
    return Response.json({ mode: "multipart" }, { headers });

  try {
    if (resolveDocumentStorageConfiguration().kind !== "vercel-blob")
      return Response.json({ mode: "multipart" }, { headers });
    const files = body.files.map((value) => {
      if (!value || typeof value !== "object") throw new DocumentError("invalid_input");
      const file = value as { name?: unknown; size?: unknown; contentType?: unknown };
      if (
        typeof file.name !== "string" ||
        typeof file.size !== "number" ||
        typeof file.contentType !== "string"
      )
        throw new DocumentError("invalid_input");
      return {
        name: file.name,
        size: file.size,
        contentType: file.contentType,
      };
    });
    const intents = await createUploadIntents(user.id, files);
    return Response.json(
      { mode: "presigned", intents: intents satisfies UploadIntent[] },
      { headers },
    );
  } catch (error) {
    if (error instanceof DocumentError)
      return failure(error.code, error.status);
    return failure("storage_unavailable", 503);
  }
}
