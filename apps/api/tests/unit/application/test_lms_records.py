from datetime import UTC, datetime, timedelta, timezone

import pytest

from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSSubmissionRecord,
    SubmissionStatus,
)
from haui_compass.domain.shared.errors import DomainValidationError

HANOI = timezone(timedelta(hours=7))
COURSE = ExternalRef("mock-lms", "course-1")
ASSIGNMENT = ExternalRef("mock-lms", "assignment-1")
DEADLINE = datetime(2026, 10, 7, 16, 59, tzinfo=UTC)


def assignment(**overrides: object) -> LMSAssignmentRecord:
    values: dict[str, object] = {
        "ref": ASSIGNMENT,
        "course_ref": COURSE,
        "title": "Lab report",
        "deadline": DEADLINE,
    }
    values.update(overrides)
    return LMSAssignmentRecord(**values)  # type: ignore[arg-type]


class TestExternalRef:
    def test_provider_is_part_of_the_identity(self) -> None:
        assert ExternalRef("a", "1") != ExternalRef("b", "1")
        assert ExternalRef("a", "1") == ExternalRef("a", "1")
        assert len({ExternalRef("a", "1"), ExternalRef("b", "1")}) == 2

    def test_text_is_stripped_and_must_not_be_blank(self) -> None:
        assert ExternalRef(" mock ", " 7 ") == ExternalRef("mock", "7")
        with pytest.raises(DomainValidationError):
            ExternalRef("", "1")
        with pytest.raises(DomainValidationError):
            ExternalRef("mock", "  ")

    def test_string_form_is_namespaced(self) -> None:
        assert str(ExternalRef("mock-lms", "42")) == "mock-lms:42"


class TestNotFound:
    def test_error_carries_what_was_missing(self) -> None:
        error = LMSNotFoundError(LMSEntity.COURSE, COURSE)
        assert error.entity is LMSEntity.COURSE
        assert error.ref == COURSE
        assert "course" in str(error) and "mock-lms:course-1" in str(error)
        assert isinstance(error, LookupError)


class TestCourseRecord:
    def test_holds_its_values_and_code_is_optional(self) -> None:
        assert LMSCourseRecord(ref=COURSE, name="Databases").code is None
        assert LMSCourseRecord(ref=COURSE, name=" Databases ", code="DB1").name == "Databases"

    def test_blank_name_or_code_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError):
            LMSCourseRecord(ref=COURSE, name=" ")
        with pytest.raises(DomainValidationError):
            LMSCourseRecord(ref=COURSE, name="Databases", code="")

    def test_has_no_place_for_raw_provider_payloads(self) -> None:
        assert set(LMSCourseRecord.__dataclass_fields__) == {"ref", "name", "code"}


class TestAssignmentRecord:
    def test_holds_its_values(self) -> None:
        record = assignment(estimated_effort=timedelta(hours=2))
        assert record.deadline == DEADLINE
        assert record.estimated_effort == timedelta(hours=2)

    def test_deadline_and_effort_are_optional_and_not_zero_by_default(self) -> None:
        record = assignment(deadline=None)
        assert record.deadline is None
        assert record.estimated_effort is None

    def test_deadline_is_normalised_to_utc(self) -> None:
        record = assignment(deadline=DEADLINE.astimezone(HANOI))
        assert record.deadline == DEADLINE
        assert record.deadline is not None and record.deadline.utcoffset() == timedelta(0)

    def test_naive_deadline_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            assignment(deadline=datetime(2026, 10, 7, 23, 59))

    def test_negative_effort_and_blank_title_are_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            assignment(estimated_effort=timedelta(minutes=-1))
        with pytest.raises(DomainValidationError):
            assignment(title="")

    def test_course_must_be_from_the_same_provider(self) -> None:
        with pytest.raises(DomainValidationError, match="different providers"):
            assignment(course_ref=ExternalRef("other-lms", "course-1"))

    def test_has_no_place_for_raw_provider_payloads(self) -> None:
        fields = set(LMSAssignmentRecord.__dataclass_fields__)
        assert fields == {"ref", "course_ref", "title", "deadline", "estimated_effort"}


class TestSubmissionRecord:
    def test_submitted_at_is_optional_and_normalised(self) -> None:
        record = LMSSubmissionRecord(
            assignment_ref=ASSIGNMENT,
            status=SubmissionStatus.SUBMITTED,
            submitted_at=DEADLINE.astimezone(HANOI),
        )
        assert record.submitted_at == DEADLINE
        assert (
            LMSSubmissionRecord(
                assignment_ref=ASSIGNMENT, status=SubmissionStatus.LATE
            ).submitted_at
            is None
        )

    def test_naive_submission_time_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            LMSSubmissionRecord(
                assignment_ref=ASSIGNMENT,
                status=SubmissionStatus.SUBMITTED,
                submitted_at=datetime(2026, 10, 7, 12, 0),
            )

    def test_not_submitted_cannot_have_a_submission_time(self) -> None:
        with pytest.raises(DomainValidationError, match="not-submitted"):
            LMSSubmissionRecord(
                assignment_ref=ASSIGNMENT,
                status=SubmissionStatus.NOT_SUBMITTED,
                submitted_at=DEADLINE,
            )

    def test_status_set_is_small_and_has_an_explicit_unknown(self) -> None:
        assert {status.value for status in SubmissionStatus} == {
            "not_submitted",
            "submitted",
            "late",
            "unknown",
        }
