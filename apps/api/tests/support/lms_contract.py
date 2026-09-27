"""Reusable contract tests for any ``LMSProvider`` implementation.

Subclass ``LMSProviderContract`` in a ``Test*`` class and override the three fixtures. Every
assertion below uses only the port and its records, so MockLMSProvider now, and HaUILMSProvider,
CanvasProvider and MoodleProvider later, must all satisfy the same expectations.

Fixture requirements: ``student`` has at least one course, and at least one of its courses has an
assignment; ``unknown_student`` is a well-formed ref the provider does not know.
"""

import dataclasses
from datetime import timedelta

import pytest

from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSProvider,
    LMSSubmissionRecord,
    SubmissionStatus,
)

FORBIDDEN_PAYLOAD_FIELDS = {"raw", "meta", "payload", "extra", "json", "data"}


class LMSProviderContract:
    @pytest.fixture
    def provider(self) -> LMSProvider:
        raise NotImplementedError

    @pytest.fixture
    def student(self) -> ExternalRef:
        raise NotImplementedError

    @pytest.fixture
    def unknown_student(self) -> ExternalRef:
        raise NotImplementedError

    # --- courses -----------------------------------------------------------------------------

    def test_courses_are_typed_unique_and_namespaced(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        courses = provider.get_courses(student)
        assert courses, "the fixture student must have courses"
        assert all(isinstance(c, LMSCourseRecord) for c in courses)
        refs = [c.ref for c in courses]
        assert len(set(refs)) == len(refs)
        assert len({r.provider for r in refs}) == 1
        assert all(c.name.strip() for c in courses)

    # --- assignments -------------------------------------------------------------------------

    def test_assignments_reference_known_courses_and_have_utc_deadlines(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        course_refs = {c.ref for c in provider.get_courses(student)}
        assignments = provider.get_assignments(student)
        assert assignments, "the fixture student must have assignments"
        assert all(isinstance(a, LMSAssignmentRecord) for a in assignments)
        refs = [a.ref for a in assignments]
        assert len(set(refs)) == len(refs)
        for a in assignments:
            assert a.course_ref in course_refs
            assert a.ref.provider == a.course_ref.provider
            if a.deadline is not None:
                assert a.deadline.utcoffset() == timedelta(0)

    def test_no_filter_means_all_and_course_filters_partition_the_result(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        everything = provider.get_assignments(student)
        assert provider.get_assignments(student, courses=None) == everything
        per_course = [
            a
            for c in provider.get_courses(student)
            for a in provider.get_assignments(student, courses=[c.ref])
        ]
        assert sorted(per_course, key=lambda a: str(a.ref)) == sorted(
            everything, key=lambda a: str(a.ref)
        )

    def test_a_course_filter_only_returns_that_courses_assignments(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        for course in provider.get_courses(student):
            for a in provider.get_assignments(student, courses=[course.ref]):
                assert a.course_ref == course.ref

    def test_an_empty_filter_means_none(self, provider: LMSProvider, student: ExternalRef) -> None:
        assert provider.get_assignments(student, courses=[]) == ()
        assert provider.get_submission_statuses(student, assignments=[]) == ()

    def test_an_unknown_course_is_an_error_not_an_empty_result(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        known = provider.get_courses(student)[0].ref
        missing = ExternalRef(known.provider, "no-such-course-xyz")
        with pytest.raises(LMSNotFoundError) as info:
            provider.get_assignments(student, courses=[missing])
        assert info.value.entity is LMSEntity.COURSE
        assert info.value.ref == missing

    # --- submissions -------------------------------------------------------------------------

    def test_submission_records_refer_to_known_assignments_once_each(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        assignment_refs = {a.ref for a in provider.get_assignments(student)}
        submissions = provider.get_submission_statuses(student)
        assert all(isinstance(s, LMSSubmissionRecord) for s in submissions)
        refs = [s.assignment_ref for s in submissions]
        assert len(set(refs)) == len(refs)
        assert set(refs) <= assignment_refs
        for s in submissions:
            assert isinstance(s.status, SubmissionStatus)
            if s.submitted_at is not None:
                assert s.submitted_at.utcoffset() == timedelta(0)

    def test_an_assignment_filter_returns_exactly_the_requested_subset(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        submissions = provider.get_submission_statuses(student)
        if not submissions:
            pytest.skip("provider reports no submission records for the fixture student")
        wanted = submissions[0].assignment_ref
        result = provider.get_submission_statuses(student, assignments=[wanted])
        assert [s.assignment_ref for s in result] == [wanted]

    def test_an_unknown_assignment_is_an_error_not_an_empty_result(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        known = provider.get_courses(student)[0].ref
        missing = ExternalRef(known.provider, "no-such-assignment-xyz")
        with pytest.raises(LMSNotFoundError) as info:
            provider.get_submission_statuses(student, assignments=[missing])
        assert info.value.entity is LMSEntity.ASSIGNMENT

    # --- unknown student ---------------------------------------------------------------------

    def test_an_unknown_student_is_an_error_everywhere(
        self, provider: LMSProvider, unknown_student: ExternalRef
    ) -> None:
        for call in (
            lambda: provider.get_courses(unknown_student),
            lambda: provider.get_assignments(unknown_student),
            lambda: provider.get_submission_statuses(unknown_student),
        ):
            with pytest.raises(LMSNotFoundError) as info:
                call()
            assert info.value.entity is LMSEntity.STUDENT
            assert info.value.ref == unknown_student

    # --- determinism, immutability, no payload leakage ---------------------------------------

    def test_repeated_calls_return_equal_results(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        assert provider.get_courses(student) == provider.get_courses(student)
        assert provider.get_assignments(student) == provider.get_assignments(student)
        assert provider.get_submission_statuses(student) == provider.get_submission_statuses(
            student
        )

    def test_results_are_tuples_of_frozen_records(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        for result in (
            provider.get_courses(student),
            provider.get_assignments(student),
            provider.get_submission_statuses(student),
        ):
            assert isinstance(result, tuple)
            for record in result:
                assert dataclasses.is_dataclass(record)
                first_field = dataclasses.fields(record)[0].name
                with pytest.raises(dataclasses.FrozenInstanceError):
                    setattr(record, first_field, None)

    def test_records_carry_no_raw_provider_payload(
        self, provider: LMSProvider, student: ExternalRef
    ) -> None:
        for result in (
            provider.get_courses(student),
            provider.get_assignments(student),
            provider.get_submission_statuses(student),
        ):
            for record in result:
                names = {f.name.lower() for f in dataclasses.fields(record)}
                assert not names & FORBIDDEN_PAYLOAD_FIELDS
