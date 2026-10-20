import pytest
from fastapi.testclient import TestClient
from httpx import Response

from haui_compass.api.app_factory import create_app
from haui_compass.api.dependencies import build_container
from haui_compass.application.ports.knowledge import GroundedAnswerInput, ProviderGroundedAnswer


def test_grounding_and_integrity_before_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "integrity-test-key")
    container = build_container()

    class Provider:
        calls = 0
        forged = False

        async def answer(self, request: GroundedAnswerInput) -> ProviderGroundedAnswer:
            self.calls += 1
            return ProviderGroundedAnswer(
                answer="3NF hạn chế phụ thuộc bắc cầu.",
                citation_handles=("invented" if self.forged else "c1",),
            )

    provider = Provider()
    container.compass_answer.provider = provider
    client = TestClient(create_app(container))
    endpoint = "/api/v1/internal/compass/answer"
    headers = {"X-Compass-Service-Key": "integrity-test-key"}
    evidence = [
        {
            "chunk_id": "chunk-1",
            "document_id": "doc-1",
            "filename": "mock.md",
            "content": "3NF hạn chế phụ thuộc bắc cầu.",
        }
    ]

    def ask(message: str, sources: list[dict[str, str]]) -> Response:
        return client.post(
            endpoint, headers=headers, json={"message": message, "evidence": sources}
        )

    response = ask("Giải thích 3NF", evidence)
    assert response.status_code == 200
    assert response.json()["status"] == "answered"
    assert response.json()["citations"] == ["chunk-1"]
    assert provider.calls == 1
    # No evidence: the provider may reply conversationally, but a citation it invents fails closed.
    response = ask("Giải thích 3NF", [])
    assert response.json()["status"] == "abstained" and provider.calls == 2
    assert response.json()["citations"] == []
    response = ask("Làm hộ bài tập tính điểm để nộp", evidence)
    assert response.json()["status"] == "abstained"
    assert "gợi ý từng bước" in response.json()["answer"]
    assert response.json()["citations"] == [] and provider.calls == 2
    public = client.post(
        "/api/v1/knowledge/query",
        json={
            "question": "Làm hộ bài tập tính điểm để nộp",
            "scope": "course",
            "course_id": "db",
        },
    )
    assert public.status_code == 200
    assert public.json()["fallback_reason"] == "academic_integrity"
    assert "gợi ý từng bước" in public.json()["answer"]
    followup = client.post(
        endpoint,
        headers=headers,
        json={
            "message": "Làm hết đi",
            "evidence": evidence,
            "history": [{"role": "user", "content": "Đây là bài tập tính điểm"}],
        },
    )
    assert followup.json()["status"] == "abstained" and provider.calls == 2
    provider.forged = True
    response = ask("Giải thích 3NF", evidence)
    assert response.json()["status"] == "abstained"
    assert response.json()["citations"] == []
