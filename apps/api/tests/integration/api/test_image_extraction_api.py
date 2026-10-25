import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from haui_compass.api.app_factory import create_app
from haui_compass.api.dependencies import build_container
from haui_compass.application.ports.documents import ExtractedPage
from haui_compass.infrastructure.retrieval.ocr import VisionOCR

PATH = "/api/v1/internal/compass/extract-image"


def test_image_endpoint_auth_mime_bytes_and_structured_pages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "test-service-key")
    client = TestClient(create_app(build_container()))
    assert client.post(PATH, content=b"x").status_code == 403
    headers = {"X-Compass-Service-Key": "test-service-key", "Content-Type": "image/svg+xml"}
    assert client.post(PATH, headers=headers, content=b"<svg/>").status_code == 415
    headers["Content-Type"] = "image/png"
    assert client.post(PATH, headers=headers, content=b"bad-image").status_code == 400
    assert (
        client.post(PATH, headers=headers, content=b"x" * (5 * 1024 * 1024 + 1)).status_code == 413
    )

    async def extract(
        self: VisionOCR, content: bytes, content_type: str
    ) -> tuple[ExtractedPage, ...]:
        assert content.startswith(b"\x89PNG") and content_type == "image/png"
        return (ExtractedPage(1, "| Môn | Phút |\n|---|---|\n| AI | 90 |\n\n$$x^2$$"),)

    monkeypatch.setattr(VisionOCR, "extract_image", extract)
    buffer = io.BytesIO()
    Image.new("RGB", (20, 20)).save(buffer, format="PNG")
    response = client.post(PATH, headers=headers, content=buffer.getvalue())
    assert response.status_code == 200
    assert response.json()["pages"][0]["page_number"] == 1
    assert "$$x^2$$" in response.json()["pages"][0]["text"]
