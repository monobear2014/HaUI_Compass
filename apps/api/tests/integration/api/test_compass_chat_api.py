from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app
from haui_compass.application.ports.knowledge import GroundedAnswerInput, ProviderGroundedAnswer

KEY = "test-internal-service-key"
PAYLOAD: dict[str, Any] = {
    "message": "Softmax là gì?",
    "evidence": [
        {
            "chunk_id": "real-chunk",
            "document_id": "real-document",
            "filename": "lecture.md",
            "heading": "Softmax",
            "content": "Softmax converts logits into probabilities.",
        }
    ],
}


@pytest.fixture(autouse=True)
def service_key(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", KEY)
    yield


class Provider:
    def __init__(self, output: ProviderGroundedAnswer) -> None:
        self.output = output
        self.requests: list[GroundedAnswerInput] = []

    async def answer(self, request: GroundedAnswerInput) -> ProviderGroundedAnswer:
        self.requests.append(request)
        return self.output


def test_internal_route_requires_service_auth_before_generation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = Provider(ProviderGroundedAnswer(answer="answer", citation_handles=("c1",)))
    client = TestClient(create_app(build_container(grounded_answer_provider=provider)))
    path = "/api/v1/internal/compass/answer"
    for headers in ({}, {"X-Compass-Service-Key": "wrong"}):
        assert client.post(path, json=PAYLOAD, headers=headers).status_code == 403
    monkeypatch.delenv("COMPASS_SERVICE_KEY")
    assert (
        client.post(path, json=PAYLOAD, headers={"X-Compass-Service-Key": KEY}).status_code == 403
    )
    assert provider.requests == []


def test_answer_maps_only_real_chunks_and_passes_bounded_conversation() -> None:
    provider = Provider(ProviderGroundedAnswer(answer="Softmax ... [c1]", citation_handles=("c1",)))
    client = TestClient(create_app(build_container(grounded_answer_provider=provider)))
    response = client.post(
        "/api/v1/internal/compass/answer",
        headers={"X-Compass-Service-Key": KEY},
        json={
            **PAYLOAD,
            "history": [{"role": "user", "content": "Giải thích softmax"}],
        },
    )
    assert response.status_code == 200
    assert response.json()["citations"] == ["real-chunk"]
    assert provider.requests[0].history[0].content == "Giải thích softmax"
    assert provider.requests[0].evidence[0].source_type == "uploaded_private"


@pytest.mark.parametrize(
    "handles,abstained", [(("fabricated",), False), (("c1", "c1"), False), ((), False), ((), True)]
)
def test_invalid_citations_and_provider_refusal_fail_closed(
    handles: tuple[str, ...],
    abstained: bool,
) -> None:
    provider = Provider(
        ProviderGroundedAnswer(answer="unsupported", citation_handles=handles, abstained=abstained)
    )
    client = TestClient(create_app(build_container(grounded_answer_provider=provider)))
    response = client.post(
        "/api/v1/internal/compass/answer", headers={"X-Compass-Service-Key": KEY}, json=PAYLOAD
    )
    assert response.json()["status"] == "abstained"
    assert response.json()["citations"] == []
    assert "unsupported" not in response.json()["answer"]


def test_empty_evidence_does_not_call_llm_and_unconfigured_llm_is_not_mocked() -> None:
    client = TestClient(create_app(build_container()))
    headers = {"X-Compass-Service-Key": KEY}
    path = "/api/v1/internal/compass/answer"
    assert (
        client.post(path, headers=headers, json={**PAYLOAD, "evidence": []}).json()["status"]
        == "abstained"
    )
    assert client.post(path, headers=headers, json=PAYLOAD).status_code == 503


def test_internal_request_limits_history_and_context() -> None:
    client = TestClient(create_app(build_container()))
    for payload in (
        {**PAYLOAD, "history": [{"role": "user", "content": "x"}] * 9},
        {**PAYLOAD, "evidence": [PAYLOAD["evidence"][0]] * 7},
    ):
        assert (
            client.post(
                "/api/v1/internal/compass/answer",
                headers={"X-Compass-Service-Key": KEY},
                json=payload,
            ).status_code
            == 422
        )


def test_unauthorized_internal_request_does_not_expose_validation_schema() -> None:
    client = TestClient(create_app(build_container()))
    response = client.post("/api/v1/internal/compass/answer", json={})
    assert response.status_code == 403


def test_non_ascii_service_key_is_rejected_without_server_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("COMPASS_SERVICE_KEY", "clé-configured")
    client = TestClient(create_app(build_container()))
    assert (
        client.post(
            "/api/v1/internal/compass/answer",
            json=PAYLOAD,
            headers={"X-Compass-Service-Key": KEY},
        ).status_code
        == 403
    )
