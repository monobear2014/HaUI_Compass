import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import {
  DocumentError,
  listDocuments,
  saveDocuments,
} from "@/lib/document-store";
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_FILES } from "@/lib/documents";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers });
export function GET(request: NextRequest) {
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return failure("unauthorized", 401);
  return Response.json({ documents: listDocuments(user.id) }, { headers });
}
export async function POST(request: NextRequest) {
  const user = getSessionUser(request.cookies.get(SESSION_COOKIE)?.value);
  if (!user) return failure("unauthorized", 401);
  if (!sameOrigin(request)) return failure("invalid_origin", 403);
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    return failure("invalid_input", 400);
  const limit = MAX_DOCUMENT_BYTES * MAX_DOCUMENT_FILES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    return failure("file_size", 413);
  // Bound streamed/chunked requests too; don't trust Content-Length alone.
  const reader = request.body?.getReader();
  if (!reader) return failure("invalid_input", 400);
  try {
    const parts: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel();
        return failure("file_size", 413);
      }
      parts.push(value);
    }
    const form = await new Response(Buffer.concat(parts), {
      headers: { "Content-Type": request.headers.get("content-type")! },
    }).formData();
    const entries = form.getAll("files");
    if (entries.some((entry) => !(entry instanceof File)))
      return failure("invalid_input", 400);
    const documents = await saveDocuments(user.id, entries as File[]);
    return Response.json({ documents }, { status: 201, headers });
  } catch (error) {
    if (error instanceof DocumentError)
      return failure(error.code, error.status);
    if (error instanceof TypeError) return failure("invalid_input", 400);
    return failure("unavailable", 503);
  } finally {
    reader.releaseLock();
  }
}
