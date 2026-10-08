"""Bounded text-only pypdf adapter. Parsing runs in a short-lived isolated process."""

import asyncio
import io
import json
import sys

from pypdf import PdfReader

from haui_compass.application.ports.documents import ExtractedPage, PdfExtractionError

MAX_BYTES = 5 * 1024 * 1024
MAX_PAGES = 200
MAX_TEXT_CHARS = 1_000_000
MAX_PAGE_STREAM_BYTES = 4 * 1024 * 1024


def extract_pages(content: bytes) -> tuple[ExtractedPage, ...]:
    if not content or len(content) > MAX_BYTES or not content.startswith(b"%PDF-"):
        raise PdfExtractionError("invalid_pdf")
    try:
        reader = PdfReader(io.BytesIO(content), strict=True)
        if reader.is_encrypted:
            raise PdfExtractionError("pdf_encrypted")
        if not reader.pages:
            raise PdfExtractionError("pdf_empty")
        if len(reader.pages) > MAX_PAGES:
            raise PdfExtractionError("pdf_limits_exceeded")
        pages = []
        total_chars = 0
        for index, page in enumerate(reader.pages, 1):
            contents = page.get_contents()
            if contents and len(contents.get_data()) > MAX_PAGE_STREAM_BYTES:
                raise PdfExtractionError("pdf_limits_exceeded")
            text = (page.extract_text() or "").replace("\x00", "").strip()
            total_chars += len(text)
            if total_chars > MAX_TEXT_CHARS:
                raise PdfExtractionError("pdf_limits_exceeded")
            pages.append(ExtractedPage(index, text))
        if not any(page.text.strip() for page in pages):
            raise PdfExtractionError("pdf_no_text")
        return tuple(pages)
    except PdfExtractionError:
        raise
    except Exception as exc:
        raise PdfExtractionError("invalid_pdf") from exc


class PypdfTextExtractor:
    async def extract(self, content: bytes) -> tuple[ExtractedPage, ...]:
        process = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "haui_compass.infrastructure.retrieval.pdf",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        try:
            stdout, _ = await asyncio.wait_for(process.communicate(content), timeout=15)
        except (TimeoutError, asyncio.CancelledError) as exc:
            if process.returncode is None:
                process.kill()
            await process.wait()
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise PdfExtractionError("pdf_extraction_timeout") from None
        if process.returncode != 0 or not stdout:
            raise PdfExtractionError("pdf_limits_exceeded")
        result = json.loads(stdout)
        if "error" in result:
            raise PdfExtractionError(result["error"])
        return tuple(ExtractedPage(page["page_number"], page["text"]) for page in result["pages"])


def _worker() -> None:
    # Resource limits supplement byte/page/text bounds for hostile compressed streams.
    if sys.platform != "win32":
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
        if sys.platform == "linux":
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    result: dict[str, object]
    try:
        pages = extract_pages(sys.stdin.buffer.read(MAX_BYTES + 1))
        result = {"pages": [{"page_number": p.page_number, "text": p.text} for p in pages]}
    except (PdfExtractionError, MemoryError) as exc:
        result = {
            "error": str(exc) if isinstance(exc, PdfExtractionError) else "pdf_limits_exceeded"
        }
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    _worker()
