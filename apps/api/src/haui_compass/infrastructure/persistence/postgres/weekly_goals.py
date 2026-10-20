from collections.abc import Callable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from haui_compass.application.ports.weekly_goals import WeeklyGoal
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.students.ids import StudentId
from haui_compass.infrastructure.persistence.postgres.mapping import utc
from haui_compass.infrastructure.persistence.postgres.models import WeeklyGoalRow


class PostgresWeeklyGoalRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def _row(self, student_id: StudentId, period: PlanPeriod) -> WeeklyGoalRow | None:
        return self._session_provider().scalar(
            select(WeeklyGoalRow).where(
                WeeklyGoalRow.student_id == student_id,
                WeeklyGoalRow.period_start == utc(period.start),
                WeeklyGoalRow.period_end == utc(period.end),
            )
        )

    def save(self, goal: WeeklyGoal) -> WeeklyGoal:
        session = self._session_provider()
        row = self._row(goal.student_id, goal.period)
        if row is None:
            row = WeeklyGoalRow(
                student_id=goal.student_id,
                period_start=utc(goal.period.start),
                period_end=utc(goal.period.end),
            )
            session.add(row)
        row.goal_text = goal.goal_text
        row.target_minutes = goal.target_minutes
        row.study_windows = [
            [utc(w.starts_at).isoformat(), utc(w.ends_at).isoformat()] for w in goal.study_windows
        ]
        row.updated_at = utc(goal.updated_at)
        session.flush()
        return goal

    def get(self, student_id: StudentId, period: PlanPeriod) -> WeeklyGoal | None:
        row = self._row(student_id, period)
        return None if row is None else _to_domain(row)

    def list_for_student(self, student_id: StudentId) -> tuple[WeeklyGoal, ...]:
        rows = self._session_provider().scalars(
            select(WeeklyGoalRow)
            .where(WeeklyGoalRow.student_id == student_id)
            .order_by(WeeklyGoalRow.period_start, WeeklyGoalRow.period_end)
        )
        return tuple(_to_domain(row) for row in rows)


def _to_domain(row: WeeklyGoalRow) -> WeeklyGoal:
    return WeeklyGoal(
        student_id=StudentId(row.student_id),
        period=PlanPeriod(start=utc(row.period_start), end=utc(row.period_end)),
        goal_text=row.goal_text,
        target_minutes=row.target_minutes,
        study_windows=tuple(
            StudyWindow(
                starts_at=datetime.fromisoformat(start), ends_at=datetime.fromisoformat(end)
            )
            for start, end in row.study_windows
        ),
        updated_at=utc(row.updated_at),
    )
