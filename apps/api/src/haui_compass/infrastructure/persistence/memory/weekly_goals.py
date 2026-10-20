"""In-memory weekly goal storage for development and tests."""

from datetime import datetime

from haui_compass.application.ports.weekly_goals import WeeklyGoal
from haui_compass.domain.plans.plan import PlanPeriod
from haui_compass.domain.students.ids import StudentId


class InMemoryWeeklyGoalRepository:
    def __init__(self) -> None:
        self._goals: dict[tuple[StudentId, datetime, datetime], WeeklyGoal] = {}

    def save(self, goal: WeeklyGoal) -> WeeklyGoal:
        self._goals[(goal.student_id, goal.period.start, goal.period.end)] = goal
        return goal

    def get(self, student_id: StudentId, period: PlanPeriod) -> WeeklyGoal | None:
        return self._goals.get((student_id, period.start, period.end))

    def list_for_student(self, student_id: StudentId) -> tuple[WeeklyGoal, ...]:
        return tuple(
            sorted(
                (goal for goal in self._goals.values() if goal.student_id == student_id),
                key=lambda goal: (goal.period.start, goal.period.end),
            )
        )
