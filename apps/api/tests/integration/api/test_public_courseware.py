from pathlib import Path

from fastapi.testclient import TestClient

from haui_compass.api.app_factory import create_app
from haui_compass.api.dependencies import build_container


def test_real_public_materials_are_browsable_with_attribution_and_source_citations() -> None:
    client = TestClient(create_app(build_container()))
    root = "/api/v1/knowledge"
    courses = client.get(root + "/courses").json()["courses"]
    assert {c["id"] for c in courses} >= {"ai", "ml", "la", "stats", "automation"}
    total = 0
    for course in ["ai", "ml", "la", "stats", "automation"]:
        listing = client.get(f"{root}/courses/{course}/materials")
        assert listing.status_code == 200
        documents = listing.json()["materials"]
        assert documents
        total += len(documents)
        for doc in documents:
            assert doc["authors"] and doc["license_url"].startswith("https://creativecommons.org/")
            assert doc["source_url"].startswith(
                ("https://ocw.mit.edu/", "https://raw.githubusercontent.com/d2l-ai/")
            )
            response = client.get(f"{root}/courses/{course}/materials/{doc['slug']}")
            assert response.status_code == 200 and response.json()["content"].strip()
            if doc["format"] == "pdf":
                assert response.json()["page"] == 1 and response.json()["page_count"] >= 2
                assert (
                    client.get(f"{root}/courses/{course}/materials/{doc['slug']}?page=2").json()[
                        "page"
                    ]
                    == 2
                )
    assert total == 12
    for course, question in [
        ("ai", "Breadth first search và depth first search khác nhau như thế nào?"),
        ("ml", "Linear regression sử dụng squared loss như thế nào?"),
        ("la", "Tích vô hướng (dot product) là gì?"),
        ("stats", "Xác suất có điều kiện (conditional probability) là gì?"),
        ("automation", "PID control gồm những thành phần nào?"),
    ]:
        result = client.post(
            root + "/query",
            json={
                "scope": "course",
                "course_id": course,
                "question": question,
                "public_only": True,
            },
        )
        assert result.status_code == 200
        data = result.json()
        assert data["status"] == "answered", (course, data["fallback_reason"])
        assert data["citations"]
        for citation in data["citations"]:
            assert citation["source_type"] == "open_educational"
            assert citation["source_label"] == "Học liệu công khai"
            assert f"courses/{course}/" in citation["local_path"]
            if citation["local_path"].endswith(".pdf"):
                assert citation["page"] >= 1
    assert client.get(root + "/courses/unknown/materials").status_code == 404
    assert client.get(root + "/courses/la/materials/mit-pid.pdf").status_code == 404
    assert (
        client.get(root + "/courses/automation/materials/mit-pid.pdf?page=200").status_code == 404
    )
    assert client.get(root + "/courses/automation/materials/mit-pid.pdf?page=0").status_code == 422


def test_browsing_rejects_source_tampering(tmp_path: Path) -> None:
    import shutil

    root = Path(__file__).resolve().parents[5] / "data"
    shutil.copytree(root, tmp_path / "data")
    container = build_container(knowledge_root=tmp_path / "data")
    client = TestClient(create_app(container))
    (tmp_path / "data/knowledge/courses/la/d2l-linear-algebra.md").write_text("tampered")
    response = client.get("/api/v1/knowledge/courses/la/materials/d2l-linear-algebra.md")
    assert response.status_code == 503
    assert "tampered" not in response.text


def test_public_only_does_not_answer_from_legacy_demo_pack() -> None:
    client = TestClient(create_app(build_container()))
    result = client.post(
        "/api/v1/knowledge/query",
        json={
            "scope": "course",
            "course_id": "db",
            "question": "Database Mini Project cần nộp những gì?",
            "public_only": True,
        },
    )
    assert result.status_code == 200
    assert result.json()["status"] == "abstained"
    assert result.json()["citations"] == []
