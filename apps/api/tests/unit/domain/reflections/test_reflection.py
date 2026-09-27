from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.domain.reflections.reflection import (
    Reflection,
    ReflectionPeriod,
    ReflectionResponses,
    WorkloadFeedback,
)
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId

STUDENT_ID = StudentId(UUID(int=1))
PERIOD_START = datetime(2026, 10, 1, tzinfo=UTC)
PERIOD_END = datetime(2026, 10, 8, tzinfo=UTC)
TASK_A = TaskId(UUID(int=10))
TASK_B = TaskId(UUID(int=11))


def period(**overrides: object) -> ReflectionPeriod:
    values: dict[str, object] = {"start": PERIOD_START, "end": PERIOD_END}
    values.update(overrides)
    return ReflectionPeriod(**values)  # type: ignore[arg-type]


def reflection(**overrides: object) -> Reflection:
    values: dict[str, object] = {
        "student_id": STUDENT_ID,
        "period": period(),
        "submitted_at": PERIOD_END,
        "responses": ReflectionResponses(),
    }
    values.update(overrides)
    return Reflection(**values)  # type: ignore[arg-type]


class TestReflectionPeriod:
    def test_holds_its_values(self) -> None:
        p = period()
        assert p.start == PERIOD_START
        assert p.end == PERIOD_END

    def test_is_immutable(self) -> None:
        p = period()
        with pytest.raises(AttributeError):
            p.start = PERIOD_END  # type: ignore[misc]

    def test_end_before_start_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="end must be strictly after"):
            period(end=PERIOD_START - timedelta(days=1))

    def test_empty_period_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="end must be strictly after"):
            period(end=PERIOD_START)

    def test_naive_start_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            period(start=datetime(2026, 10, 1))

    def test_naive_end_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            period(end=datetime(2026, 10, 8))


class TestReflectionResponses:
    def test_defaults_are_empty(self) -> None:
        r = ReflectionResponses()
        assert r.reflected_task_ids == ()
        assert r.workload_feedback is None
        assert r.difficult_topics == ()
        assert r.deferred_task_ids == ()

    def test_duplicate_task_ids_are_collapsed_and_ordered(self) -> None:
        r = ReflectionResponses(reflected_task_ids=(TASK_B, TASK_A, TASK_B))
        assert r.reflected_task_ids == (TASK_A, TASK_B)

    def test_duplicate_topics_are_collapsed_case_insensitively(self) -> None:
        r = ReflectionResponses(difficult_topics=("Recursion", "recursion", "Graphs"))
        assert r.difficult_topics == ("Graphs", "Recursion")

    def test_blank_topic_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be blank"):
            ReflectionResponses(difficult_topics=("   ",))

    def test_order_of_input_does_not_affect_output(self) -> None:
        a = ReflectionResponses(deferred_task_ids=(TASK_A, TASK_B))
        b = ReflectionResponses(deferred_task_ids=(TASK_B, TASK_A))
        assert a.deferred_task_ids == b.deferred_task_ids

    def test_is_immutable(self) -> None:
        r = ReflectionResponses()
        with pytest.raises(AttributeError):
            r.workload_feedback = WorkloadFeedback.TOO_HEAVY  # type: ignore[misc]


class TestReflection:
    def test_holds_its_values(self) -> None:
        r = reflection()
        assert r.student_id == STUDENT_ID
        assert r.responses == ReflectionResponses()

    def test_is_immutable(self) -> None:
        r = reflection()
        with pytest.raises(AttributeError):
            r.submitted_at = PERIOD_START  # type: ignore[misc]

    def test_naive_submitted_at_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            reflection(submitted_at=datetime(2026, 10, 8))

    def test_submitted_before_period_start_is_rejected(self) -> None:
        with pytest.raises(DomainValidationError, match="must not be before"):
            reflection(submitted_at=PERIOD_START - timedelta(seconds=1))

    def test_submitted_mid_period_is_allowed(self) -> None:
        r = reflection(submitted_at=PERIOD_START + timedelta(days=1))
        assert r.submitted_at == PERIOD_START + timedelta(days=1)
