"""Small builders for domain objects in tests. Ids are derived from small integers."""

from datetime import UTC, datetime, timedelta
from uuid import UUID

from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.courses.course import CourseId
from haui_compass.domain.recommendations.candidate import ActionCandidate
from haui_compass.domain.risk.signal import RiskEvidence, RiskLevel, RiskReasonCode, RiskSignal
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus

NOW = datetime(2026, 10, 5, 8, 0, tzinfo=UTC)
COURSE_ID = CourseId(UUID(int=1))

_RISK_REASON = {
    RiskLevel.LOW: RiskReasonCode.SUFFICIENT_SLACK,
    RiskLevel.MEDIUM: RiskReasonCode.LOW_SLACK,
    RiskLevel.HIGH: RiskReasonCode.EFFORT_EXCEEDS_CAPACITY,
    RiskLevel.UNKNOWN: RiskReasonCode.MISSING_CAPACITY,
}


def assignment_id(n: int) -> AssignmentId:
    return AssignmentId(UUID(int=n))


def task_id(n: int) -> TaskId:
    return TaskId(UUID(int=n))


def make_assignment(n: int, *, deadline: datetime) -> Assignment:
    return Assignment(
        id=assignment_id(n), course_id=COURSE_ID, title=f"Assignment {n}", deadline=deadline
    )


def make_task(
    n: int,
    assignment_n: int,
    *,
    status: TaskStatus = TaskStatus.NOT_STARTED,
    minutes: int = 60,
) -> Task:
    return Task(
        id=task_id(n),
        assignment_id=assignment_id(assignment_n),
        title=f"Task {n}",
        estimated_duration=timedelta(minutes=minutes),
        status=status,
    )


def make_risk(
    assignment_n: int, level: RiskLevel, *, deadline: datetime, as_of: datetime = NOW
) -> RiskSignal:
    return RiskSignal(
        assignment_id=assignment_id(assignment_n),
        as_of=as_of,
        level=level,
        reason_codes=(_RISK_REASON[level],),
        evidence=RiskEvidence(
            deadline=deadline,
            time_until_deadline=deadline - as_of,
            open_task_count=1,
            remaining_effort=None,
            available_capacity=None,
            slack=None,
            slack_ratio=None,
        ),
        engine_version=1,
    )


def make_candidate(
    task_n: int,
    assignment_n: int | None = None,
    *,
    level: RiskLevel = RiskLevel.LOW,
    deadline: datetime = NOW + timedelta(days=3),
    status: TaskStatus = TaskStatus.NOT_STARTED,
    minutes: int = 60,
) -> ActionCandidate:
    """Candidate for task ``task_n``; by default each task gets its own assignment (same number)."""
    a = assignment_n if assignment_n is not None else task_n
    return ActionCandidate(
        task=make_task(task_n, a, status=status, minutes=minutes),
        assignment=make_assignment(a, deadline=deadline),
        risk=make_risk(a, level, deadline=deadline),
    )
