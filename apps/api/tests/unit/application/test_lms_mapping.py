import dataclasses
from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

from haui_compass.application.lms_mapping import (
    SkipReason,
    assignment_id_for,
    course_id_for,
    map_assignments,
    map_course,
    student_id_for,
)
from haui_compass.application.ports.lms import ExternalRef, LMSAssignmentRecord, LMSCourseRecord
from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.courses.course import Course

HANOI = timezone(timedelta(hours=7))
COURSE_REF = ExternalRef("mock-lms", "course-1")
DEADLINE = datetime(2026, 10, 7, 16, 59, tzinfo=UTC)


def record(n: int, **overrides: object) -> LMSAssignmentRecord:
    values: dict[str, object] = {
        "ref": ExternalRef("mock-lms", f"a-{n}"),
        "course_ref": COURSE_REF,
        "title": f"Assignment {n}",
        "deadline": DEADLINE,
    }
    values.update(overrides)
    return LMSAssignmentRecord(**values)  # type: ignore[arg-type]


class TestIds:
    def test_the_same_external_entity_always_gets_the_same_domain_id(self) -> None:
        ref = ExternalRef("mock-lms", "42")
        assert course_id_for(ref) == course_id_for(ExternalRef("mock-lms", "42"))
        assert assignment_id_for(ref) == assignment_id_for(ref)

    def test_ids_are_uuids_not_the_external_value(self) -> None:
        ref = ExternalRef("mock-lms", "42")
        assert isinstance(course_id_for(ref), UUID)
        assert "42" not in str(course_id_for(ref))

    def test_a_course_and_an_assignment_with_the_same_external_id_stay_apart(self) -> None:
        ref = ExternalRef("mock-lms", "42")
        assert len({course_id_for(ref), assignment_id_for(ref), student_id_for(ref)}) == 3

    def test_the_provider_namespaces_the_id(self) -> None:
        assert course_id_for(ExternalRef("a", "1")) != course_id_for(ExternalRef("b", "1"))

    def test_the_derivation_is_pinned(self) -> None:
        # Golden value: guards the namespace and scheme, since changing either re-keys every id.
        assert str(course_id_for(ExternalRef("mock-lms", "course-1"))) == (
            "877e5afa-a6fb-5ec1-85d9-a9daac50aa2b"
        )


class TestMapCourse:
    def test_maps_id_and_name_and_keeps_the_source(self) -> None:
        mapped = map_course(LMSCourseRecord(ref=COURSE_REF, name="Machine Learning", code="ML1"))
        assert mapped.course == Course(id=course_id_for(COURSE_REF), name="Machine Learning")
        assert mapped.source == COURSE_REF

    def test_the_course_code_is_intentionally_not_mapped(self) -> None:
        assert {f.name for f in dataclasses.fields(Course)} == {"id", "name"}


class TestMapAssignments:
    def test_maps_fields_and_links_to_the_mapped_course(self) -> None:
        result = map_assignments([record(1, estimated_effort=timedelta(hours=3))])
        (item,) = result.mapped
        assert item.assignment == Assignment(
            id=assignment_id_for(ExternalRef("mock-lms", "a-1")),
            course_id=course_id_for(COURSE_REF),
            title="Assignment 1",
            deadline=DEADLINE,
            estimated_effort=timedelta(hours=3),
        )
        assert item.source == ExternalRef("mock-lms", "a-1")
        assert result.skipped == ()

    def test_unknown_effort_stays_unknown(self) -> None:
        (item,) = map_assignments([record(1)]).mapped
        assert item.assignment.estimated_effort is None

    def test_an_assignment_without_a_deadline_is_skipped_with_a_reason_not_given_one(self) -> None:
        result = map_assignments([record(1, deadline=None), record(2)])
        assert [m.source.id for m in result.mapped] == ["a-2"]
        assert len(result.skipped) == 1
        assert result.skipped[0].source == ExternalRef("mock-lms", "a-1")
        assert result.skipped[0].reason is SkipReason.NO_DEADLINE

    def test_provider_timezone_does_not_reach_the_domain(self) -> None:
        (item,) = map_assignments([record(1, deadline=DEADLINE.astimezone(HANOI))]).mapped
        assert item.assignment.deadline == DEADLINE
        assert item.assignment.deadline.utcoffset() == timedelta(0)

    def test_order_is_preserved_and_mapping_is_repeatable(self) -> None:
        records = [record(3), record(1), record(2)]
        first = map_assignments(records)
        assert [m.source.id for m in first.mapped] == ["a-3", "a-1", "a-2"]
        assert first == map_assignments(records)

    def test_domain_assignment_has_no_provider_specific_fields(self) -> None:
        names = {f.name for f in dataclasses.fields(Assignment)}
        assert names == {"id", "course_id", "title", "deadline", "estimated_effort"}
