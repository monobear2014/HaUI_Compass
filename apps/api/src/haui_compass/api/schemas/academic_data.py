"""Strict HTTP schema for academic-import v1, including canonical flat CSV."""

import csv
import io
from datetime import datetime
from typing import Literal, cast

from pydantic import Field, field_validator, model_validator

from haui_compass.api.schemas.common import ApiModel, require_aware
from haui_compass.application.academic_import import AcademicSource


class CourseImportDTO(ApiModel):
    external_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    code: str | None = None


class AssignmentImportDTO(ApiModel):
    external_id: str = Field(min_length=1)
    course_external_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    deadline: datetime | None
    estimated_effort_minutes: int | None = Field(default=None, ge=0)

    _deadline_aware = field_validator("deadline")(
        lambda value: require_aware(value) if value else None
    )


class SubmissionImportDTO(ApiModel):
    assignment_external_id: str = Field(min_length=1)
    status: Literal["not_submitted", "submitted", "late", "unknown"]
    submitted_at: datetime | None = None

    _submitted_aware = field_validator("submitted_at")(
        lambda value: require_aware(value) if value else None
    )


class AcademicImportRequest(ApiModel):
    schema_version: Literal["haui-compass-academic-import-v1"]
    student_external_id: str = Field(min_length=1)
    source: Literal["csv", "json", "manual"]
    courses: tuple[CourseImportDTO, ...]
    assignments: tuple[AssignmentImportDTO, ...]
    submissions: tuple[SubmissionImportDTO, ...] = ()

    @model_validator(mode="after")
    def unique_ids(self) -> "AcademicImportRequest":
        if len({item.external_id for item in self.courses}) != len(self.courses):
            raise ValueError("course external_id values must be unique")
        if len({item.external_id for item in self.assignments}) != len(self.assignments):
            raise ValueError("assignment external_id values must be unique")
        if len({item.assignment_external_id for item in self.submissions}) != len(self.submissions):
            raise ValueError("submission assignment_external_id values must be unique")
        return self


class AcademicImportResponse(ApiModel):
    kind: Literal["academic_import"] = "academic_import"
    student_provider: str
    student_id: str
    source: str
    courses: int
    assignments: int
    submissions: int
    idempotent_retry: bool


class CsvImportRequest(ApiModel):
    student_external_id: str = Field(min_length=1)
    content: str = Field(min_length=1, max_length=1_000_000)


class AcademicDataResponse(AcademicImportResponse):
    courses_data: tuple[CourseImportDTO, ...]
    assignments_data: tuple[AssignmentImportDTO, ...]
    submissions_data: tuple[SubmissionImportDTO, ...]


CSV_COLUMNS = (
    "course_id",
    "course_name",
    "course_code",
    "assignment_id",
    "assignment_title",
    "deadline",
    "submission_status",
    "submitted_at",
    "estimated_effort_minutes",
)


def parse_canonical_csv(content: str, *, student_external_id: str) -> AcademicImportRequest:
    """Parse the one supported flat representation; no partial rows are accepted."""
    reader = csv.DictReader(io.StringIO(content))
    if reader.fieldnames is None or tuple(reader.fieldnames) != CSV_COLUMNS:
        raise ValueError(
            "CSV columns must exactly match the documented academic-import-v1 template"
        )
    courses: dict[str, CourseImportDTO] = {}
    assignments: list[AssignmentImportDTO] = []
    submissions: list[SubmissionImportDTO] = []
    for row in reader:
        course_id = (row["course_id"] or "").strip()
        assignment_id = (row["assignment_id"] or "").strip()
        if not course_id or not assignment_id:
            raise ValueError("each CSV row needs course_id and assignment_id")
        course = CourseImportDTO(
            external_id=course_id,
            name=(row["course_name"] or "").strip(),
            code=(row["course_code"] or "").strip() or None,
        )
        previous = courses.setdefault(course_id, course)
        if previous != course:
            raise ValueError("repeated course_id rows must have identical course details")
        effort = (row["estimated_effort_minutes"] or "").strip()
        assignments.append(
            AssignmentImportDTO(
                external_id=assignment_id,
                course_external_id=course_id,
                title=(row["assignment_title"] or "").strip(),
                deadline=(
                    datetime.fromisoformat((row["deadline"] or "").strip())
                    if (row["deadline"] or "").strip()
                    else None
                ),
                estimated_effort_minutes=int(effort) if effort else None,
            )
        )
        status = (row["submission_status"] or "").strip()
        submitted = (row["submitted_at"] or "").strip()
        if status:
            submissions.append(
                SubmissionImportDTO(
                    assignment_external_id=assignment_id,
                    status=cast(Literal["not_submitted", "submitted", "late", "unknown"], status),
                    submitted_at=datetime.fromisoformat(submitted) if submitted else None,
                )
            )
        elif submitted:
            raise ValueError("submitted_at requires submission_status")
    return AcademicImportRequest(
        schema_version="haui-compass-academic-import-v1",
        student_external_id=student_external_id,
        source=AcademicSource.CSV_IMPORT.value,
        courses=tuple(courses.values()),
        assignments=tuple(assignments),
        submissions=tuple(submissions),
    )
