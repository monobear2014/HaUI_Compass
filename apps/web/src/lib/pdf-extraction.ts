import "server-only";
import { DocumentError } from "./document-store";
import type { PdfPage } from "./document-chunking.cjs";

export async function extractPdf(
  content: Buffer,
): Promise<PdfPage[] | undefined> {
  const key = process.env.COMPASS_SERVICE_KEY;
  if (!key) throw new DocumentError("pdf_extraction_unavailable", 503);
  let response: Response;
  try {
    response = await fetch(
      new URL(
        "/api/v1/internal/compass/extract-pdf",
        process.env.COMPASS_API_URL || "http://127.0.0.1:8000",
      ),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-Compass-Service-Key": key,
        },
        body: new Uint8Array(content),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    throw new DocumentError("pdf_extraction_unavailable", 503);
  }
  if (!response.ok)
    throw new DocumentError(
      response.status === 400 ? "invalid_pdf" : "pdf_extraction_unavailable",
      response.status === 400 ? 400 : 503,
    );
  const result = await response.json();
  if (
    result.status === "unsupported" &&
    ["pdf_no_text", "pdf_empty", "pdf_encrypted"].includes(result.reason)
  )
    return undefined;
  if (
    result.status !== "ready" ||
    !Array.isArray(result.pages) ||
    !result.pages.length ||
    result.pages.length > 200 ||
    !result.pages.every(
      (page: PdfPage, index: number) =>
        page.page_number === index + 1 && typeof page.text === "string",
    ) ||
    result.pages.reduce(
      (sum: number, page: PdfPage) => sum + page.text.length,
      0,
    ) > 1_000_000 ||
    !result.pages.some((page: PdfPage) => page.text.trim())
  )
    throw new DocumentError("invalid_pdf", 400);
  return result.pages;
}
