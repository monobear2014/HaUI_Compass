from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.students.state import (
    STUDENT_STATE_SCHEMA_VERSION,
    CapacityState,
    ProgressState,
    StudentState,
)

HOUR = timedelta(hours=1)
STUDENT_ID = StudentId(UUID(int=10))
AS_OF = datetime(2026, 10, 5, 8, 0, tzinfo=UTC)


def capacity(available_hours: float, committed_hours: float) -> CapacityState:
    return CapacityState(available=available_hours * HOUR, committed=committed_hours * HOUR)


def progress(not_started: int = 0, in_progress: int = 0, completed: int = 0) -> ProgressState:
    return ProgressState(not_started=not_started, in_progress=in_progress, completed=completed)


def make_state(**overrides: object) -> StudentState:
    values: dict[str, object] = {
        "student_id": STUDENT_ID,
        "as_of": AS_OF,
        "capacity": capacity(10, 4),
        "progress": progress(not_started=2),
    }
    values.update(overrides)
    return StudentState(**values)  # type: ignore[arg-type]


class TestCapacity:
    def test_no_committed_work_leaves_all_capacity(self) -> None:
        state = capacity(10, 0)
        assert state.remaining == 10 * HOUR
        assert state.overcommitted_by == timedelta(0)

    def test_partially_committed(self) -> None:
        state = capacity(10, 4)
        assert state.remaining == 6 * HOUR
        assert state.overcommitted_by == timedelta(0)

    def test_exactly_full(self) -> None:
        state = capacity(10, 10)
        assert state.remaining == timedelta(0)
        assert state.overcommitted_by == timedelta(0)

    def test_overcommitment_is_reported_not_hidden(self) -> None:
        state = capacity(10, 13.5)
        assert state.remaining == timedelta(0)
        assert state.overcommitted_by == timedelta(hours=3.5)
        assert state.committed == timedelta(hours=13.5)

    def test_zero_available_with_work_is_fully_overcommitted(self) -> None:
        state = capacity(0, 2)
        assert state.remaining == timedelta(0)
        assert state.overcommitted_by == 2 * HOUR

    def test_zero_and_zero(self) -> None:
        state = capacity(0, 0)
        assert state.remaining == timedelta(0)
        assert state.overcommitted_by == timedelta(0)

    @pytest.mark.parametrize(("available", "committed"), [(-1, 0), (0, -1)])
    def test_negative_values_are_rejected(self, available: int, committed: int) -> None:
        with pytest.raises(DomainValidationError, match="must not be negative"):
            CapacityState(available=available * HOUR, committed=committed * HOUR)


class TestProgress:
    def test_zero_tasks_has_no_ratio(self) -> None:
        state = progress()
        assert state.total == 0
        assert state.remaining == 0
        assert state.completion_ratio is None

    def test_all_not_started(self) -> None:
        state = progress(not_started=4)
        assert (state.total, state.remaining, state.completion_ratio) == (4, 4, 0.0)

    def test_mixed_statuses(self) -> None:
        state = progress(not_started=1, in_progress=2, completed=1)
        assert state.total == 4
        assert state.remaining == 3
        assert state.completion_ratio == 0.25

    def test_all_completed(self) -> None:
        state = progress(completed=3)
        assert (state.total, state.remaining, state.completion_ratio) == (3, 0, 1.0)

    @pytest.mark.parametrize("field", ["not_started", "in_progress", "completed"])
    def test_negative_counts_are_rejected(self, field: str) -> None:
        with pytest.raises(DomainValidationError, match=field):
            ProgressState(**{"not_started": 0, "in_progress": 0, "completed": 0, field: -1})


class TestStudentState:
    def test_holds_its_values(self) -> None:
        state = make_state()
        assert state.student_id == STUDENT_ID
        assert state.as_of == AS_OF
        assert state.capacity == capacity(10, 4)
        assert state.progress == progress(not_started=2)

    def test_is_immutable(self) -> None:
        state = make_state()
        with pytest.raises(AttributeError):
            state.as_of = AS_OF + HOUR  # type: ignore[misc]
        with pytest.raises(AttributeError):
            state.capacity.committed = HOUR  # type: ignore[misc]

    def test_equal_inputs_give_equal_states(self) -> None:
        assert make_state() == make_state()
        assert hash(make_state()) == hash(make_state())

    def test_as_of_must_be_timezone_aware(self) -> None:
        with pytest.raises(DomainValidationError, match="timezone-aware"):
            make_state(as_of=datetime(2026, 10, 5, 8, 0))

    def test_as_of_is_normalised_to_utc(self) -> None:
        hanoi = timezone(timedelta(hours=7))
        state = make_state(as_of=datetime(2026, 10, 5, 15, 0, tzinfo=hanoi))
        assert state.as_of == AS_OF
        assert state.as_of.utcoffset() == timedelta(0)

    def test_schema_version_defaults_to_the_current_version(self) -> None:
        assert make_state().schema_version == STUDENT_STATE_SCHEMA_VERSION == 1

    def test_schema_version_must_be_positive(self) -> None:
        with pytest.raises(DomainValidationError, match="schema_version"):
            make_state(schema_version=0)
