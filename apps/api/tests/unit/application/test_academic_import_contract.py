"""Pilot Academic Import Evaluation v1: deterministic boundary cases."""

from datetime import UTC, datetime
from typing import cast

import pytest
from pydantic import ValidationError

from haui_compass.api.schemas.academic_data import (
    AcademicImportRequest,
    CsvImportRequest,
    parse_canonical_csv,
)
from haui_compass.application.academic_import import (
    AcademicImportError,
    AcademicImportErrorCode,
    AcademicSource,
    dataset_from_values,
)
from haui_compass.application.ports.lms import SubmissionStatus


def valid_json() -> dict[str, object]:
    return {
        "schema_version": "haui-compass-academic-import-v1",
        "student_external_id": "evaluation-student",
        "source": "json",
        "courses": [{"external_id": "db", "name": "Databases", "code": "DB101"}],
        "assignments": [
            {
                "external_id": "report",
                "course_external_id": "db",
                "title": "Schema report",
                "deadline": "2026-10-08T17:00:00+07:00",
                "estimated_effort_minutes": 90,
            }
        ],
        "submissions": [
            {
                "assignment_external_id": "report",
                "status": "not_submitted",
                "submitted_at": None,
            }
        ],
    }


def valid_csv() -> str:
    return "\n".join(
        (
            "course_id,course_name,course_code,assignment_id,assignment_title,deadline,submission_status,submitted_at,estimated_effort_minutes",
            "db,Databases,DB101,report,Schema report,2026-10-08T17:00:00+07:00,not_submitted,,90",
        )
    )


def test_valid_json_is_accepted() -> None:
    request = AcademicImportRequest.model_validate(valid_json())
    assert request.assignments[0].deadline == datetime(2026, 10, 8, 10, tzinfo=UTC)


def test_valid_csv_is_accepted() -> None:
    request = parse_canonical_csv(valid_csv(), student_external_id="evaluation-student")
    assert request.source == "csv"
    assert request.assignments[0].title == "Schema report"


def test_csv_and_json_normalize_the_same_academic_facts() -> None:
    json_request = AcademicImportRequest.model_validate(valid_json())
    csv_request = parse_canonical_csv(valid_csv(), student_external_id="evaluation-student")
    assert [(item.external_id, item.name, item.code) for item in json_request.courses] == [
        (item.external_id, item.name, item.code) for item in csv_request.courses
    ]
    assert [
        (
            item.external_id,
            item.course_external_id,
            item.title,
            item.deadline,
            item.estimated_effort_minutes,
        )
        for item in json_request.assignments
    ] == [
        (
            item.external_id,
            item.course_external_id,
            item.title,
            item.deadline,
            item.estimated_effort_minutes,
        )
        for item in csv_request.assignments
    ]


def test_malformed_json_is_rejected() -> None:
    with pytest.raises(ValidationError):
        AcademicImportRequest.model_validate_json('{"schema_version":')


def test_malformed_csv_is_rejected() -> None:
    with pytest.raises(ValueError, match="columns must exactly match"):
        parse_canonical_csv(
            "course,assignment\ndb,report", student_external_id="evaluation-student"
        )


def test_unknown_schema_version_is_rejected() -> None:
    payload = valid_json()
    payload["schema_version"] = "v0"
    with pytest.raises(ValidationError):
        AcademicImportRequest.model_validate(payload)


@pytest.mark.parametrize("field", ["courses", "assignments"])
def test_duplicate_course_or_assignment_id_is_rejected(field: str) -> None:
    payload = valid_json()
    values = list(cast(list[dict[str, object]], payload[field]))
    values.append(values[0])
    payload[field] = values
    with pytest.raises(ValidationError):
        AcademicImportRequest.model_validate(payload)


def test_orphan_assignment_is_rejected() -> None:
    with pytest.raises(AcademicImportError) as error:
        dataset_from_values(
            student_id="evaluation-student",
            source=AcademicSource.JSON_IMPORT,
            courses=(("db", "Databases", None),),
            assignments=(
                ("report", "missing", "Schema report", datetime(2026, 10, 8, tzinfo=UTC), 90),
            ),
            submissions=(),
        )
    assert error.value.code is AcademicImportErrorCode.ORPHAN_ASSIGNMENT


def test_orphan_submission_is_rejected() -> None:
    with pytest.raises(AcademicImportError) as error:
        dataset_from_values(
            student_id="evaluation-student",
            source=AcademicSource.JSON_IMPORT,
            courses=(("db", "Databases", None),),
            assignments=(),
            submissions=(("missing", SubmissionStatus.NOT_SUBMITTED, None),),
        )
    assert error.value.code is AcademicImportErrorCode.ORPHAN_SUBMISSION


def test_naive_deadline_is_rejected() -> None:
    payload = valid_json()
    payload["assignments"] = [
        {
            "external_id": "report",
            "course_external_id": "db",
            "title": "Schema report",
            "deadline": "2026-10-08T17:00:00",
            "estimated_effort_minutes": 90,
        }
    ]
    with pytest.raises(ValidationError):
        AcademicImportRequest.model_validate(payload)


def test_invalid_submission_state_is_rejected() -> None:
    payload = valid_json()
    payload["submissions"] = [
        {"assignment_external_id": "report", "status": "invented", "submitted_at": None}
    ]
    with pytest.raises(ValidationError):
        AcademicImportRequest.model_validate(payload)


def test_oversized_csv_is_rejected_before_parsing() -> None:
    with pytest.raises(ValidationError):
        CsvImportRequest(student_external_id="evaluation-student", content="x" * 1_000_001)
