"""Backend-only document extraction contracts; web storage retains ownership."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ExtractedPage:
    page_number: int
    text: str


class PdfExtractionError(ValueError):
    """Stable operational code; never includes uploaded bytes or parser exception text."""


class PdfTextExtractor(Protocol):
    async def extract(self, content: bytes) -> tuple[ExtractedPage, ...]: ...


class ImageTextExtractor(Protocol):
    async def extract_image(
        self, content: bytes, content_type: str
    ) -> tuple[ExtractedPage, ...]: ...
