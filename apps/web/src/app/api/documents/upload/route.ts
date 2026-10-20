import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { issueSignedToken } from "@vercel/blob";
import { NextRequest } from "next/server";
import { getSessionUser, sameOrigin, SESSION_COOKIE } from "@/lib/demo-auth";
import {
  authorizeUploadToken,
  completeUploadIntent,
} from "@/lib/document-upload-lifecycle";
import { documentContentHead } from "@/lib/document-file-storage";
import { DocumentError } from "@/lib/document-store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return Response.json({ error: "invalid_input" }, { status: 400 });
  }

  const isGeneration = body.type === "blob.generate-presigned-url";
  const user = isGeneration
    ? await getSessionUser(request.cookies.get(SESSION_COOKIE)?.value)
    : null;
  if (isGeneration && (!user || !sameOrigin(request)))
    return Response.json(
      { error: user ? "invalid_origin" : "unauthorized" },
      { status: user ? 403 : 401 },
    );

  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      getSignedToken: async (pathname, clientPayload, multipart) => {
        if (!user || multipart)
          throw new DocumentError("invalid_upload_intent", 400);
        const intent = await authorizeUploadToken(user.id, pathname, clientPayload);
        const validUntil = Math.min(
          Date.now() + 10 * 60 * 1000,
          intent.expires_at,
        );
        const token = await issueSignedToken({
          pathname: intent.storage_key,
          operations: ["put"],
          allowedContentTypes: [intent.content_type],
          maximumSizeInBytes: intent.expected_size,
          validUntil,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: [intent.content_type],
            maximumSizeInBytes: intent.expected_size,
            validUntil,
            addRandomSuffix: false,
            allowOverwrite: false,
            tokenPayload: JSON.stringify({
              intentId: intent.id,
              owner: user.id,
              storageKey: intent.storage_key,
            }),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        if (!tokenPayload)
          throw new DocumentError("invalid_upload_completion", 400);
        const actual = await documentContentHead(blob.pathname);
        if (!actual)
          throw new DocumentError("invalid_upload_completion", 400);
        await completeUploadIntent(tokenPayload, {
          pathname: blob.pathname,
          size: actual.size,
          contentType: actual.contentType,
        });
      },
    });
    return Response.json(jsonResponse, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DocumentError)
      return Response.json({ error: error.code }, { status: error.status });
    return Response.json({ error: "upload_unavailable" }, { status: 503 });
  }
}
