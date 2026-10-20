"""Persistence contract for a student's weekly goal and declared free study time."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Protocol

from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.students.ids import StudentId

MAX_GOAL_TEXT_LENGTH = 500
MAX_STUDY_WINDOWS = 28


@dataclass(frozen=True, slots=True, kw_only=True)
class WeeklyGoal:
    """Student-authored intent for one plan period.

    ``study_windows`` are the student's declared free time; they are planner input, not a plan.
    ``target_minutes`` is the student's own target and is never used as capacity by itself.
    """

    student_id: StudentId
    period: PlanPeriod
    goal_text: str
    target_minutes: int
    study_windows: tuple[StudyWindow, ...]
    updated_at: datetime

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "updated_at", require_aware_utc(self.updated_at, "WeeklyGoal.updated_at")
        )
        object.__setattr__(self, "goal_text", self.goal_text.strip())
        if len(self.goal_text) > MAX_GOAL_TEXT_LENGTH:
            raise DomainValidationError("WeeklyGoal.goal_text is too long")
        if not 0 <= self.target_minutes <= 7 * 24 * 60:
            raise DomainValidationError("WeeklyGoal.target_minutes is out of range")
        if len(self.study_windows) > MAX_STUDY_WINDOWS:
            raise DomainValidationError("WeeklyGoal has too many study windows")
        windows = tuple(sorted(self.study_windows, key=lambda w: (w.starts_at, w.ends_at)))
        for window in windows:
            if window.starts_at < self.period.start or window.ends_at > self.period.end:
                raise DomainValidationError("WeeklyGoal study windows must lie inside the period")
        object.__setattr__(self, "study_windows", windows)

    @property
    def available_time(self) -> timedelta:
        return sum((w.duration for w in self.study_windows), timedelta(0))


class WeeklyGoalRepository(Protocol):
    def save(self, goal: WeeklyGoal) -> WeeklyGoal:
        """Insert or replace the goal for its (student, period)."""
        ...

    def get(self, student_id: StudentId, period: PlanPeriod) -> WeeklyGoal | None: ...

    def list_for_student(self, student_id: StudentId) -> tuple[WeeklyGoal, ...]:
        """Return goals ordered by period start."""
        ...
