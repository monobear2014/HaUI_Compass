from fastapi.testclient import TestClient

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app


def client() -> TestClient:
    return TestClient(create_app(build_container()))


def test_course_query_maps_answer_and_demo_citation() -> None:
    response = client().post(
        "/api/v1/knowledge/query",
        json={
            "question": "Database Mini Project cần nộp những gì?",
            "scope": "course",
            "course_id": "db",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["citations"]
    assert body["citations"][0]["source_label"] == "Tài liệu môn học demo"
    assert body["retrieval"]["strategy"] == "lexical"


def test_institutional_query_maps_official_citation() -> None:
    response = client().post(
        "/api/v1/knowledge/query",
        json={"question": "HaUI có các trình độ đào tạo nào?", "scope": "institutional"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "answered"
    assert body["citations"][0]["source_label"] == "Nguồn công khai HaUI"


def test_invalid_scope_course_combination_is_rejected() -> None:
    response = client().post(
        "/api/v1/knowledge/query",
        json={"question": "Câu hỏi hợp lệ", "scope": "institutional", "course_id": "db"},
    )
    assert response.status_code == 422


def test_unsupported_question_maps_abstention_without_citations() -> None:
    response = client().post(
        "/api/v1/knowledge/query",
        json={
            "question": "Lịch thi đấu bóng đá World Cup trên sao Hỏa?",
            "scope": "course",
            "course_id": "db",
        },
    )
    assert response.status_code == 200
    assert response.json()["status"] == "abstained"
    assert response.json()["citations"] == []
