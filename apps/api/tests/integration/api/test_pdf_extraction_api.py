import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader, PdfWriter

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app
from haui_compass.application.ports.documents import PdfExtractionError
from haui_compass.infrastructure.retrieval.pdf import extract_pages

FIXTURES = Path(__file__).resolve().parents[5] / "evals/rag/fixtures"
PATH = "/api/v1/internal/compass/extract-pdf"
HEADERS = {"X-Compass-Service-Key": "pdf-test", "Content-Type": "application/pdf"}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "pdf-test")
    return TestClient(create_app(build_container()))


def test_pdf_real_worker_preserves_page_numbers_and_content(client: TestClient) -> None:
    response = client.post(PATH, headers=HEADERS, content=(FIXTURES / "ml-pages.pdf").read_bytes())
    assert response.status_code == 200
    pages = response.json()["pages"]
    assert [page["page_number"] for page in pages] == [1, 2, 3]
    assert "[SOURCE:pdf-softmax]" in pages[0]["text"]
    assert "[SOURCE:pdf-gradient]" in pages[1]["text"]
    assert "[SOURCE:pdf-retrieval]" in pages[2]["text"]


@pytest.mark.parametrize(
    "name,reason", [("image-only.pdf", "pdf_no_text"), ("empty.pdf", "pdf_empty")]
)
def test_pdf_without_text_is_explicitly_unsupported(
    client: TestClient, name: str, reason: str
) -> None:
    response = client.post(PATH, headers=HEADERS, content=(FIXTURES / name).read_bytes())
    assert response.json() == {"status": "unsupported", "reason": reason, "pages": []}


def test_pdf_auth_invalid_signature_corrupt_size_and_mime(client: TestClient) -> None:
    assert client.post(PATH, content=b"%PDF-broken").status_code == 403
    for content in (b"plain text", b"%PDF-1.4\ncorrupt"):
        assert client.post(PATH, headers=HEADERS, content=content).status_code == 400
    assert (
        client.post(PATH, headers=HEADERS, content=b"x" * (5 * 1024 * 1024 + 1)).status_code == 413
    )
    assert client.post(PATH, headers={**HEADERS, "Content-Type": "text/plain"}).status_code == 415


def test_pdf_blank_pages_keep_original_numbers_and_encrypted_fail_closed() -> None:
    reader = PdfReader(FIXTURES / "ml-pages.pdf")
    writer = PdfWriter()
    writer.add_blank_page(width=595, height=842)
    writer.add_page(reader.pages[1])
    stream = io.BytesIO()
    writer.write(stream)
    pages = extract_pages(stream.getvalue())
    assert pages[0].text == ""
    assert pages[1].page_number == 2
    assert "pdf-gradient" in pages[1].text
    writer.encrypt("secret")
    encrypted = io.BytesIO()
    writer.write(encrypted)
    with pytest.raises(PdfExtractionError, match="pdf_encrypted"):
        extract_pages(encrypted.getvalue())


def test_pdf_page_limit_is_bounded() -> None:
    writer = PdfWriter()
    for _ in range(201):
        writer.add_blank_page(width=10, height=10)
    stream = io.BytesIO()
    writer.write(stream)
    with pytest.raises(PdfExtractionError, match="pdf_limits_exceeded"):
        extract_pages(stream.getvalue())
