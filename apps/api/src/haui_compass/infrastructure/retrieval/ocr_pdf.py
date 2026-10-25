"""Rasterize hostile PDFs in a killable, resource-bounded worker, never in an API thread."""

import asyncio
import base64
import io
import json
import re
import sys

from pypdf import PdfReader

from haui_compass.application.ports.documents import PdfExtractionError
from haui_compass.infrastructure.retrieval.pdf import MAX_BYTES, MAX_PAGE_STREAM_BYTES, MAX_PAGES


def render_candidates(content: bytes) -> list[tuple[int, bytes]]:
    import pypdfium2 as pdfium  # type: ignore[import-untyped]

    from haui_compass.infrastructure.retrieval.ocr import MAX_OCR_PAGES, MAX_PIXELS

    try:
        reader = PdfReader(io.BytesIO(content), strict=True)
        if reader.is_encrypted or not 0 < len(reader.pages) <= MAX_PAGES:
            raise PdfExtractionError("pdf_limits_exceeded")
        selected: list[tuple[int, bytes]] = []
        with pdfium.PdfDocument(content) as document:
            for index, source in enumerate(reader.pages):
                contents = source.get_contents()
                if contents and len(contents.get_data()) > MAX_PAGE_STREAM_BYTES:
                    raise PdfExtractionError("pdf_limits_exceeded")
                text = source.extract_text() or ""
                resources = source.get("/Resources", {})
                if hasattr(resources, "get_object"):
                    resources = resources.get_object()
                objects = resources.get("/XObject", {}) if resources else {}
                if hasattr(objects, "get_object"):
                    objects = objects.get_object()
                has_image = any(
                    obj.get_object().get("/Subtype") == "/Image" for obj in objects.values()
                )
                layout = source.extract_text(extraction_mode="layout") or ""
                needs_ocr = (
                    len(re.sub(r"\W", "", text)) < 30
                    or has_image
                    or bool(re.search(r"[∫∑√∂∏∞]", text))
                    or bool(re.search(r"\S[ ]{3,}\S", layout))
                )
                if not needs_ocr:
                    continue
                if len(selected) >= MAX_OCR_PAGES:
                    raise PdfExtractionError("ocr_page_limit")
                page = document[index]
                try:
                    width, height = page.get_size()
                    if min(width, height) <= 0 or width * height > MAX_PIXELS:
                        raise PdfExtractionError("pdf_limits_exceeded")
                    bitmap = page.render(scale=min(2.0, 2200 / max(width, height)))
                    try:
                        output = io.BytesIO()
                        bitmap.to_pil().save(output, format="PNG")
                        selected.append((index + 1, output.getvalue()))
                    finally:
                        bitmap.close()
                finally:
                    page.close()
        return selected
    except PdfExtractionError:
        raise
    except Exception:
        raise PdfExtractionError("invalid_pdf") from None


async def render_isolated(content: bytes) -> list[tuple[int, bytes]]:
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "haui_compass.infrastructure.retrieval.ocr_pdf",
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
    )
    try:
        stdout, _ = await asyncio.wait_for(process.communicate(content), timeout=10)
    except (TimeoutError, asyncio.CancelledError) as error:
        if process.returncode is None:
            process.kill()
        await process.wait()
        if isinstance(error, asyncio.CancelledError):
            raise
        raise PdfExtractionError("ocr_timeout") from None
    if process.returncode != 0 or len(stdout) > 32 * 1024 * 1024:
        raise PdfExtractionError("pdf_limits_exceeded")
    try:
        value = json.loads(stdout)
    except ValueError:
        raise PdfExtractionError("invalid_pdf") from None
    if "error" in value:
        code = value["error"]
        allowed = {"ocr_page_limit", "pdf_limits_exceeded", "invalid_pdf"}
        raise PdfExtractionError(code if code in allowed else "invalid_pdf")
    try:
        return [(item["number"], base64.b64decode(item["image"])) for item in value["pages"]]
    except (ValueError, KeyError):
        raise PdfExtractionError("invalid_pdf") from None


if __name__ == "__main__":
    result: dict[str, object]
    if sys.platform != "win32":
        import resource

        resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
        if sys.platform == "linux":
            resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    try:
        pages = render_candidates(sys.stdin.buffer.read(MAX_BYTES + 1))
        result = {"pages": [{"number": n, "image": base64.b64encode(b).decode()} for n, b in pages]}
    except Exception as error:
        result = {
            "error": str(error) if isinstance(error, PdfExtractionError) else "pdf_limits_exceeded"
        }
    sys.stdout.write(json.dumps(result))
