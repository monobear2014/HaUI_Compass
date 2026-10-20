import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.ports.reflection_coach import CoachText, ReflectionCoachInput
from haui_compass.application.ports.weekly_goals import WeeklyGoal
from haui_compass.application.use_cases.reflection_coach import CoachWeeklyReflection
from haui_compass.application.use_cases.weekly_cycle import (
    ReviewCode,
    WeeklyReview,
    _round_minutes,
    assignment_capacities,
    clip_windows,
)
from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.courses.course import CourseId
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.infrastructure.persistence.memory.weekly_goals import (
    InMemoryWeeklyGoalRepository,
)
from haui_compass.infrastructure.reflection_coach.template import (
    TemplateReflectionCoachProvider,
)

NOW = datetime(2026, 10, 5, 2, tzinfo=UTC)
PERIOD = PlanPeriod(start=NOW - timedelta(hours=2), end=NOW + timedelta(days=7))


def window(start_hours: float, minutes: int) -> StudyWindow:
    start = NOW + timedelta(hours=start_hours)
    return StudyWindow(starts_at=start, ends_at=start + timedelta(minutes=minutes))


def test_clip_windows_drops_past_and_trims_crossing_time() -> None:
    clipped = clip_windows((window(-2, 60), window(-0.5, 60), window(3, 30)), NOW)
    assert clipped == (
        StudyWindow(starts_at=NOW, ends_at=NOW + timedelta(minutes=30)),
        window(3, 30),
    )


def test_assignment_capacity_counts_only_future_time_before_deadline() -> None:
    assignment = Assignment(
        id=AssignmentId(UUID(int=1)),
        course_id=CourseId(UUID(int=2)),
        title="Lab",
        deadline=NOW + timedelta(hours=4),
    )
    (capacity,) = assignment_capacities(
        (window(-1, 120), window(3, 120), window(10, 60)), (assignment,), NOW
    )
    assert capacity.available_until_deadline == timedelta(minutes=60 + 60)


def test_target_rounding_is_explicit() -> None:
    assert _round_minutes(420 * 0.8) == 330
    assert _round_minutes(7) == 0


def test_weekly_goal_validates_and_repository_upserts() -> None:
    student = StudentId(UUID(int=9))
    with pytest.raises(DomainValidationError):
        WeeklyGoal(
            student_id=student,
            period=PERIOD,
            goal_text="x",
            target_minutes=60,
            study_windows=(window(200, 30),),
            updated_at=NOW,
        )
    repository = InMemoryWeeklyGoalRepository()
    first = WeeklyGoal(
        student_id=student,
        period=PERIOD,
        goal_text=" a ",
        target_minutes=60,
        study_windows=(window(5, 30), window(1, 30)),
        updated_at=NOW,
    )
    assert first.goal_text == "a"
    assert first.study_windows[0] == window(1, 30)
    repository.save(first)
    second = WeeklyGoal(
        student_id=student,
        period=PERIOD,
        goal_text="b",
        target_minutes=0,
        study_windows=(),
        updated_at=NOW,
    )
    repository.save(second)
    assert repository.get(student, PERIOD) == second
    assert repository.list_for_student(student) == (second,)


def review() -> WeeklyReview:
    return WeeklyReview(
        period=PERIOD,
        as_of=NOW,
        goal=None,
        planned=timedelta(minutes=300),
        actual=timedelta(minutes=80),
        plan_revisions=1,
        tasks=(),
        deadlines=(),
        active_days=1,
        strengths=(ReviewCode.COMPLETED_TASKS,),
        weaknesses=(ReviewCode.MISSED_SESSIONS, ReviewCode.LOW_FOLLOW_THROUGH),
    )


class Provider:
    def __init__(self, output: object = None, error: Exception | None = None, delay: float = 0):
        self.output, self.error, self.delay = output, error, delay

    async def coach(self, facts: ReflectionCoachInput) -> CoachText:
        await asyncio.sleep(self.delay)
        if self.error:
            raise self.error
        return self.output  # type: ignore[return-value]


@pytest.mark.parametrize(
    ("provider", "source", "reason"),
    [
        (None, "template", "not_configured"),
        (Provider(CoachText("Tuần ổn.", ("Bạn muốn giữ điều gì?",))), "ai", None),
        (Provider(CoachText("planned_minutes=300", ("?",))), "template", "invalid_output"),
        (
            Provider(CoachText("Cần cải thiện missed_sessions.", ("Bạn muốn đổi gì?",))),
            "template",
            "invalid_output",
        ),
        (Provider(CoachText("ok", ())), "template", "invalid_output"),
        (Provider(error=RuntimeError("boom")), "template", "provider_error"),
        (Provider(CoachText("ok", ("?",)), delay=0.2), "template", "timeout"),
    ],
)
def test_reflection_coach_uses_ai_only_when_valid(
    provider: Provider | None, source: str, reason: str | None
) -> None:
    use_case = CoachWeeklyReflection(
        template=TemplateReflectionCoachProvider(), provider=provider, timeout_seconds=0.05
    )
    result = asyncio.run(use_case.execute(review()))
    assert result.source == source
    assert result.fallback_reason == reason
    assert result.summary and 1 <= len(result.questions) <= 3


def test_template_coach_is_grounded_in_review_facts() -> None:
    result = asyncio.run(
        CoachWeeklyReflection(template=TemplateReflectionCoachProvider()).execute(review())
    )
    assert "80 phút" in result.summary and "300 phút" in result.summary
    assert any("Khung giờ" in q for q in result.questions)
