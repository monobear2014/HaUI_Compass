"""Behaviour specific to MockLMSProvider and its canonical scenario.

The provider-agnostic contract is in ``test_mock_lms_contract.py``.
"""

from datetime import datetime, timedelta

import pytest

from haui_compass.application.lms_mapping import (
    SkipReason,
    assignment_id_for,
    course_id_for,
    map_assignments,
    map_course,
)
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSEntity,
    LMSNotFoundError,
    SubmissionStatus,
)
from haui_compass.domain.risk.context import AssignmentRiskContext
from haui_compass.domain.risk.signal import RiskLevel
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.engines.risk.assess import assess_assignment_risk
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.lms.mock_data import MAIN_STUDENT, OTHER_STUDENT, PROVIDER
from support.builders import NOW

HOUR = timedelta(hours=1)


def ref(key: str) -> ExternalRef:
    return ExternalRef(PROVIDER, key)


@pytest.fixture
def provider() -> MockLMSProvider:
    return MockLMSProvider.canonical(anchor=NOW)


class TestCanonicalScenario:
    def test_has_three_named_courses(self, provider: MockLMSProvider) -> None:
        courses = provider.get_courses(MAIN_STUDENT)
        assert [c.name for c in courses] == ["Machine Learning", "Database Systems", "English"]
        assert [c.code for c in courses] == ["MOCK-ML", "MOCK-DB", "MOCK-EN"]

    def test_deadlines_span_several_horizons_relative_to_the_anchor(
        self, provider: MockLMSProvider
    ) -> None:
        deadlines = {
            a.ref.id: a.deadline for a in provider.get_assignments(MAIN_STUDENT) if a.deadline
        }
        assert deadlines["ml-a"] == NOW + timedelta(hours=36)  # imminent
        assert deadlines["db-c"] == NOW + timedelta(days=5)  # mid-range
        assert deadlines["ml-b"] == NOW + timedelta(days=12)  # far
        assert deadlines["en-read3"] == NOW - timedelta(days=1)  # overdue
        assert deadlines["db-lab2"] == NOW - timedelta(days=2)

    def test_deadlines_are_utc_although_the_lms_speaks_local_time(
        self, provider: MockLMSProvider
    ) -> None:
        for a in provider.get_assignments(MAIN_STUDENT):
            if a.deadline is not None:
                assert a.deadline.utcoffset() == timedelta(0)

    def test_one_assignment_has_no_deadline_and_two_have_no_effort_estimate(
        self, provider: MockLMSProvider
    ) -> None:
        by_id = {a.ref.id: a for a in provider.get_assignments(MAIN_STUDENT)}
        assert by_id["en-portfolio"].deadline is None
        assert by_id["en-d"].estimated_effort is None
        assert by_id["en-portfolio"].estimated_effort is None
        assert by_id["ml-a"].estimated_effort == 6 * HOUR

    def test_every_submission_status_is_represented(self, provider: MockLMSProvider) -> None:
        statuses = {s.status for s in provider.get_submission_statuses(MAIN_STUDENT)}
        assert statuses == set(SubmissionStatus)

    def test_submission_times_are_consistent_with_status(self, provider: MockLMSProvider) -> None:
        assignments = {a.ref: a for a in provider.get_assignments(MAIN_STUDENT)}
        for s in provider.get_submission_statuses(MAIN_STUDENT):
            deadline = assignments[s.assignment_ref].deadline
            if s.status is SubmissionStatus.SUBMITTED:
                assert s.submitted_at is not None and deadline is not None
                assert s.submitted_at <= deadline
            if s.status is SubmissionStatus.LATE:
                assert s.submitted_at is not None and deadline is not None
                assert s.submitted_at > deadline

    def test_the_anchor_moves_every_deadline_by_the_same_amount(self) -> None:
        later = NOW + timedelta(days=7)
        a = MockLMSProvider.canonical(anchor=NOW).get_assignments(MAIN_STUDENT)
        b = MockLMSProvider.canonical(anchor=later).get_assignments(MAIN_STUDENT)
        for first, second in zip(a, b, strict=True):
            assert first.ref == second.ref
            if first.deadline is not None and second.deadline is not None:
                assert second.deadline - first.deadline == timedelta(days=7)

    def test_a_naive_anchor_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            MockLMSProvider.canonical(anchor=datetime(2026, 10, 5, 8, 0))

    def test_a_non_utc_anchor_gives_the_same_instants(self) -> None:
        from haui_compass.infrastructure.lms.mock_data import HANOI

        utc = MockLMSProvider.canonical(anchor=NOW).get_assignments(MAIN_STUDENT)
        local = MockLMSProvider.canonical(anchor=NOW.astimezone(HANOI)).get_assignments(
            MAIN_STUDENT
        )
        assert utc == local


class TestStudentsAreIsolated:
    def test_the_other_student_sees_only_their_own_data(self, provider: MockLMSProvider) -> None:
        assert [c.name for c in provider.get_courses(OTHER_STUDENT)] == ["Physics"]
        assert [a.ref.id for a in provider.get_assignments(OTHER_STUDENT)] == ["phy-1"]

    def test_a_course_of_another_student_is_unknown(self, provider: MockLMSProvider) -> None:
        with pytest.raises(LMSNotFoundError) as info:
            provider.get_assignments(OTHER_STUDENT, courses=[ref("course-ml")])
        assert info.value.entity is LMSEntity.COURSE


class TestFilters:
    def test_filters_assignments_by_course(self, provider: MockLMSProvider) -> None:
        result = provider.get_assignments(MAIN_STUDENT, courses=[ref("course-db")])
        assert [a.ref.id for a in result] == ["db-c", "db-lab2"]

    def test_an_empty_filter_means_none_not_all(self, provider: MockLMSProvider) -> None:
        assert provider.get_assignments(MAIN_STUDENT, courses=[]) == ()
        assert provider.get_submission_statuses(MAIN_STUDENT, assignments=[]) == ()

    def test_filters_submissions_by_assignment(self, provider: MockLMSProvider) -> None:
        result = provider.get_submission_statuses(MAIN_STUDENT, assignments=[ref("en-essay")])
        assert [(s.assignment_ref.id, s.status) for s in result] == [
            ("en-essay", SubmissionStatus.LATE)
        ]

    def test_an_unknown_assignment_is_an_error_not_an_empty_result(
        self, provider: MockLMSProvider
    ) -> None:
        with pytest.raises(LMSNotFoundError) as info:
            provider.get_submission_statuses(MAIN_STUDENT, assignments=[ref("nope")])
        assert info.value.entity is LMSEntity.ASSIGNMENT


class TestNoStateLeaksOut:
    def test_results_are_immutable_tuples(self, provider: MockLMSProvider) -> None:
        courses = provider.get_courses(MAIN_STUDENT)
        assert isinstance(courses, tuple)
        with pytest.raises(AttributeError):
            courses.append(courses[0])  # type: ignore[attr-defined]

    def test_records_are_frozen(self, provider: MockLMSProvider) -> None:
        course = provider.get_courses(MAIN_STUDENT)[0]
        with pytest.raises(AttributeError):
            course.name = "Hacked"  # type: ignore[misc]
        assert provider.get_courses(MAIN_STUDENT)[0].name == "Machine Learning"

    def test_the_provider_does_not_share_the_callers_mapping(self) -> None:
        from haui_compass.infrastructure.lms.mock_data import canonical_students

        students = canonical_students(NOW)
        provider = MockLMSProvider(students)
        students.clear()
        assert len(provider.get_courses(MAIN_STUDENT)) == 3


class TestDeterminism:
    def test_two_providers_and_repeated_calls_give_identical_results(self) -> None:
        one, two = MockLMSProvider.canonical(anchor=NOW), MockLMSProvider.canonical(anchor=NOW)
        assert one.get_assignments(MAIN_STUDENT) == two.get_assignments(MAIN_STUDENT)
        assert one.get_courses(MAIN_STUDENT) == one.get_courses(MAIN_STUDENT)
        assert one.get_submission_statuses(MAIN_STUDENT) == two.get_submission_statuses(
            MAIN_STUDENT
        )


class TestDomainMapping:
    def test_canonical_assignments_map_and_the_undated_one_is_reported_skipped(
        self, provider: MockLMSProvider
    ) -> None:
        result = map_assignments(provider.get_assignments(MAIN_STUDENT))
        assert len(result.mapped) == 7
        assert [(s.source.id, s.reason) for s in result.skipped] == [
            ("en-portfolio", SkipReason.NO_DEADLINE)
        ]

    def test_mapped_assignments_belong_to_the_mapped_courses(
        self, provider: MockLMSProvider
    ) -> None:
        courses = {m.source: m.course for m in map(map_course, provider.get_courses(MAIN_STUDENT))}
        for item in map_assignments(provider.get_assignments(MAIN_STUDENT)).mapped:
            course_ref = next(
                a.course_ref for a in provider.get_assignments(MAIN_STUDENT) if a.ref == item.source
            )
            assert item.assignment.course_id == courses[course_ref].id == course_id_for(course_ref)
            assert item.assignment.id == assignment_id_for(item.source)

    def test_the_scenario_can_produce_every_risk_level(self, provider: MockLMSProvider) -> None:
        """The fixture is only useful if it can exercise the risk engine; check that it does."""
        capacity = 7 * HOUR
        levels: dict[str, RiskLevel] = {}
        for item in map_assignments(provider.get_assignments(MAIN_STUDENT)).mapped:
            assignment = item.assignment
            signal = assess_assignment_risk(
                AssignmentRiskContext(
                    assignment_id=assignment.id,
                    now=NOW,
                    deadline=assignment.deadline,
                    open_task_count=1,
                    remaining_effort=assignment.estimated_effort,
                    available_capacity_until_deadline=capacity,
                )
            )
            levels[item.source.id] = signal.level
        assert levels["ml-a"] is RiskLevel.MEDIUM  # 6h of work, 7h of capacity
        assert levels["ml-b"] is RiskLevel.HIGH  # 10h of work, 7h of capacity
        assert levels["db-c"] is RiskLevel.LOW  # 4h of work, 7h of capacity
        assert levels["en-d"] is RiskLevel.UNKNOWN  # effort not estimated
        assert levels["en-read3"] is RiskLevel.HIGH  # deadline already passed
        assert set(levels.values()) == {
            RiskLevel.LOW,
            RiskLevel.MEDIUM,
            RiskLevel.HIGH,
            RiskLevel.UNKNOWN,
        }
