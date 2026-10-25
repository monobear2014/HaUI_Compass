import "server-only";
import { DocumentError } from "./document-store";
import type { PdfPage } from "./document-chunking.cjs";
import { resolveCompassApiUrl } from "./compass-api-config";

export async function extractPdf(
  content: Buffer,
): Promise<PdfPage[] | undefined> {
  return extractPages(
    content,
    "application/pdf",
    "/api/v1/internal/compass/extract-pdf",
  );
}

export async function extractImage(
  content: Buffer,
  contentType: string,
): Promise<PdfPage[]> {
  const pages = await extractPages(
    content,
    contentType,
    "/api/v1/internal/compass/extract-image",
  );
  if (!pages) throw new DocumentError("ocr_unavailable", 503);
  return pages;
}

async function extractPages(
  content: Buffer,
  contentType: string,
  endpoint: string,
): Promise<PdfPage[] | undefined> {
  const key = process.env.COMPASS_SERVICE_KEY;
  if (!key) throw new DocumentError("pdf_extraction_unavailable", 503);
  let response: Response;
  try {
    response = await fetch(new URL(endpoint, resolveCompassApiUrl()), {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "X-Compass-Service-Key": key,
      },
      body: new Uint8Array(content),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(50_000),
    });
  } catch {
    throw new DocumentError("pdf_extraction_unavailable", 503);
  }
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    const codes = [
      "ocr_timeout",
      "ocr_provider_error",
      "ocr_unavailable",
      "ocr_page_limit",
      "invalid_image",
      "image_limits_exceeded",
      "ocr_invalid_output",
    ];
    if (codes.includes(failure?.detail))
      throw new DocumentError(
        failure.detail,
        response.status === 400 ? 400 : 503,
      );
    throw new DocumentError(
      response.status === 400 ? "invalid_pdf" : "pdf_extraction_unavailable",
      response.status === 400 ? 400 : 503,
    );
  }
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
