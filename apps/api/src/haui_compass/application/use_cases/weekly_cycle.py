"""Student-confirmed weekly cycle: propose → approve, adapt → confirm, review → next week.

Every decision here reuses the deterministic planner, replanner and risk engine. Previews never
write; approval and adaptation persist exactly what was previewed from the same inputs.
"""

from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import datetime, timedelta
from enum import StrEnum
from typing import TypeVar

from haui_compass.application.lms_mapping import map_assignments, student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.executions import TaskExecutionRepository
from haui_compass.application.ports.lms import ExternalRef, LMSProvider
from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.reflections import ConfirmedReflectionRepository
from haui_compass.application.ports.study_plans import (
    PlanRecordId,
    StoredStudyPlan,
    StudyPlanRepository,
)
from haui_compass.application.ports.tasks import TaskRepository
from haui_compass.application.ports.transactions import PersistenceTransactionManager
from haui_compass.application.ports.weekly_goals import WeeklyGoal, WeeklyGoalRepository
from haui_compass.application.use_cases.daily_recommendation import (
    AssignmentCapacity,
    DailyRecommendationResult,
    GenerateDailyRecommendationRequest,
)
from haui_compass.application.use_cases.generate_daily_recommendation import (
    GenerateDailyRecommendation,
)
from haui_compass.application.use_cases.generate_weekly_plan import (
    GenerateWeeklyPlan,
    GenerateWeeklyPlanRequest,
)
from haui_compass.application.use_cases.replan_study_plan import (
    ReplanStudyPlan,
    ReplanStudyPlanRequest,
)
from haui_compass.domain.assignments.assignment import Assignment
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan, StudyWindow
from haui_compass.domain.plans.replanning import ReplanningResult, TaskRemainingEffort
from haui_compass.domain.reflections.reflection import WorkloadFeedback
from haui_compass.domain.reflections.signals import (
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus

T = TypeVar("T")

# Explicit, tested thresholds for the weekly review and next-week draft.
ESTIMATE_TOLERANCE = 0.2
LOW_FOLLOW_THROUGH_RATIO = 0.5
CONSISTENT_DAYS = 3
WORKLOAD_ADJUSTMENT = 0.2
TARGET_ROUNDING_MINUTES = 15


def clip_windows(windows: tuple[StudyWindow, ...], now: datetime) -> tuple[StudyWindow, ...]:
    """Only time that is still ahead can be planned; past time is dropped, not rescheduled."""
    clipped: list[StudyWindow] = []
    for window in windows:
        if window.ends_at <= now:
            continue
        clipped.append(StudyWindow(starts_at=max(window.starts_at, now), ends_at=window.ends_at))
    return tuple(clipped)


def assignment_capacities(
    windows: tuple[StudyWindow, ...], assignments: tuple[Assignment, ...], now: datetime
) -> tuple[AssignmentCapacity, ...]:
    """Declared free time between now and each deadline (input preparation, not risk)."""
    result = []
    for assignment in assignments:
        total = timedelta(0)
        for window in windows:
            start = max(window.starts_at, now)
            end = min(window.ends_at, assignment.deadline)
            if end > start:
                total += end - start
        result.append(
            AssignmentCapacity(assignment_id=assignment.id, available_until_deadline=total)
        )
    return tuple(result)


def _future_time(windows: tuple[StudyWindow, ...], now: datetime) -> timedelta:
    return sum((w.duration for w in clip_windows(windows, now)), timedelta(0))


@dataclass(frozen=True, slots=True, kw_only=True)
class PlanProposal:
    plan: StudyPlan
    risk: DailyRecommendationResult


@dataclass(frozen=True, slots=True, kw_only=True)
class AdaptationProposal:
    baseline: StoredStudyPlan
    result: ReplanningResult
    risk_before: DailyRecommendationResult
    risk_after: DailyRecommendationResult


class ReviewCode(StrEnum):
    COMPLETED_TASKS = "completed_tasks"
    DEADLINES_MET = "deadlines_met"
    CONSISTENT_SESSIONS = "consistent_sessions"
    ACCURATE_ESTIMATES = "accurate_estimates"
    MISSED_SESSIONS = "missed_sessions"
    DEADLINE_MISSED = "deadline_missed"
    UNDERESTIMATED = "underestimated"
    LOW_FOLLOW_THROUGH = "low_follow_through"
    NO_ACTIVITY = "no_activity"


class DeadlineState(StrEnum):
    DONE = "done"
    MISSED = "missed"
    UPCOMING = "upcoming"


@dataclass(frozen=True, slots=True, kw_only=True)
class TaskReview:
    task: Task
    assignment: Assignment
    actual: timedelta
    sessions: int
    completed_this_period: bool
    scheduled: bool
    missed: bool


@dataclass(frozen=True, slots=True, kw_only=True)
class DeadlineReview:
    assignment: Assignment
    state: DeadlineState
    open_tasks: int


@dataclass(frozen=True, slots=True, kw_only=True)
class WeeklyReview:
    period: PlanPeriod
    as_of: datetime
    goal: WeeklyGoal | None
    planned: timedelta
    actual: timedelta
    plan_revisions: int
    tasks: tuple[TaskReview, ...]
    deadlines: tuple[DeadlineReview, ...]
    active_days: int
    strengths: tuple[ReviewCode, ...]
    weaknesses: tuple[ReviewCode, ...]


class AdjustmentCode(StrEnum):
    CARRY_OVER = "carry_over"
    WORKLOAD_TOO_HEAVY = "workload_too_heavy"
    WORKLOAD_TOO_LIGHT = "workload_too_light"
    UNDERESTIMATED = "underestimated"
    DEFERRED_FIRST = "deferred_first"
    DIFFICULT_TOPIC = "difficult_topic"


@dataclass(frozen=True, slots=True, kw_only=True)
class Adjustment:
    code: AdjustmentCode
    detail: str
    task_ids: tuple[TaskId, ...] = ()


@dataclass(frozen=True, slots=True, kw_only=True)
class GoalDraft:
    period: PlanPeriod
    saved: bool
    goal_text: str
    target_minutes: int
    study_windows: tuple[StudyWindow, ...]
    adjustments: tuple[Adjustment, ...]
    previous_period: PlanPeriod | None


def _round_minutes(value: float) -> int:
    return max(0, round(value / TARGET_ROUNDING_MINUTES) * TARGET_ROUNDING_MINUTES)


class WeeklyCycle:
    def __init__(
        self,
        *,
        task_repository: TaskRepository,
        execution_repository: TaskExecutionRepository,
        reflection_repository: ConfirmedReflectionRepository,
        plan_repository: StudyPlanRepository,
        goal_repository: WeeklyGoalRepository,
        lms: LMSProvider,
        clock: Clock,
        transaction_manager: PersistenceTransactionManager | None = None,
    ) -> None:
        self._tasks = task_repository
        self._executions = execution_repository
        self._reflections = reflection_repository
        self._plans = plan_repository
        self._goals = goal_repository
        self._lms = lms
        self._clock = clock
        self._tx = transaction_manager
        self._planner = GenerateWeeklyPlan()
        self._replanner = ReplanStudyPlan()
        self._risk = GenerateDailyRecommendation(lms=lms, clock=clock)

    def _run(self, operation: Callable[[], T]) -> T:
        return self._tx.run(operation) if self._tx is not None else operation()

    # ---- shared loading -------------------------------------------------------------------

    def _load(self, student: ExternalRef) -> tuple[tuple[Task, ...], tuple[Assignment, ...]]:
        student_id = student_id_for(student)
        tasks = tuple(record.task for record in self._tasks.list_for_student(student_id))
        assignments = tuple(
            item.assignment for item in map_assignments(self._lms.get_assignments(student)).mapped
        )
        return tasks, assignments

    def _executions_for(self, student: ExternalRef, tasks: tuple[Task, ...]) -> list[TaskExecution]:
        student_id = student_id_for(student)
        return [
            record.execution
            for task in tasks
            for record in self._executions.list_for_task(student_id, task.id)
        ]

    def _assess(
        self,
        student: ExternalRef,
        tasks: tuple[Task, ...],
        assignments: tuple[Assignment, ...],
        windows: tuple[StudyWindow, ...],
        now: datetime,
    ) -> DailyRecommendationResult:
        with_tasks = {task.assignment_id for task in tasks}
        return self._risk.execute(
            GenerateDailyRecommendationRequest(
                student=student,
                tasks=tasks,
                available_capacity=_future_time(windows, now),
                assignment_capacities=assignment_capacities(
                    windows, tuple(a for a in assignments if a.id in with_tasks), now
                ),
            )
        )

    # ---- PLAN: propose, review, approve ----------------------------------------------------

    def _propose(
        self, student: ExternalRef, period: PlanPeriod, windows: tuple[StudyWindow, ...]
    ) -> PlanProposal:
        now = self._clock.now()
        tasks, assignments = self._load(student)
        plan = self._planner.execute(
            GenerateWeeklyPlanRequest(
                student_id=student_id_for(student),
                tasks=tasks,
                assignments=assignments,
                period=period,
                study_windows=clip_windows(windows, now),
                generated_at=now,
            )
        )
        return PlanProposal(plan=plan, risk=self._assess(student, tasks, assignments, windows, now))

    def preview_plan(
        self, student: ExternalRef, period: PlanPeriod, windows: tuple[StudyWindow, ...]
    ) -> PlanProposal:
        return self._run(lambda: self._propose(student, period, windows))

    def approve_plan(
        self,
        *,
        student: ExternalRef,
        period: PlanPeriod,
        goal_text: str,
        target_minutes: int,
        windows: tuple[StudyWindow, ...],
        record_id: PlanRecordId,
    ) -> tuple[StoredStudyPlan, WeeklyGoal]:
        def operation() -> tuple[StoredStudyPlan, WeeklyGoal]:
            student_id = student_id_for(student)
            now = self._clock.now()
            goal = WeeklyGoal(
                student_id=student_id,
                period=period,
                goal_text=goal_text,
                target_minutes=target_minutes,
                study_windows=windows,
                updated_at=now,
            )
            existing = self._plans.latest(student_id, period)
            if existing is not None:
                if existing.record_id == record_id:
                    stored_goal = self._goals.get(student_id, period)
                    return existing, stored_goal or goal
                raise PersistenceError(
                    PersistenceErrorCode.RECORD_CONFLICT,
                    "a plan was already approved for this week; adapt it instead",
                )
            proposal = self._propose(student, period, windows)
            record = self._plans.save_initial(record_id=record_id, plan=proposal.plan, saved_at=now)
            return record, self._goals.save(goal)

        return self._run(operation)

    # ---- ADAPT: re-evaluate, propose, confirm ---------------------------------------------

    def _adapt(
        self,
        student: ExternalRef,
        period: PlanPeriod,
        windows: tuple[StudyWindow, ...],
        remaining: tuple[TaskRemainingEffort, ...],
    ) -> AdaptationProposal:
        from haui_compass.engines.execution.summary import summarize_task_executions

        student_id = student_id_for(student)
        now = self._clock.now()
        baseline = self._plans.latest(student_id, period)
        if baseline is None:
            raise PersistenceError(PersistenceErrorCode.RECORD_NOT_FOUND, "plan was not found")
        tasks, assignments = self._load(student)
        executions = self._executions_for(student, tasks)
        summaries = tuple(
            summarize_task_executions(tuple(e for e in executions if e.task_id == task.id))
            for task in tasks
            if any(e.task_id == task.id for e in executions)
        )
        goal = self._goals.get(student_id, period)
        before_windows = (
            goal.study_windows
            if goal is not None
            else tuple(
                StudyWindow(starts_at=b.starts_at, ends_at=b.ends_at) for b in baseline.plan.blocks
            )
        )
        result = self._replanner.execute(
            ReplanStudyPlanRequest(
                baseline_plan=baseline.plan,
                tasks=tasks,
                assignments=assignments,
                study_windows=clip_windows(windows, now),
                remaining_efforts=remaining,
                execution_summaries=summaries,
                confirmed_reflections=tuple(
                    record.confirmed for record in self._reflections.list_for_student(student_id)
                ),
                effective_at=now,
            )
        )
        return AdaptationProposal(
            baseline=baseline,
            result=result,
            risk_before=self._assess(student, tasks, assignments, before_windows, now),
            risk_after=self._assess(student, tasks, assignments, windows, now),
        )

    def preview_adaptation(
        self,
        *,
        student: ExternalRef,
        period: PlanPeriod,
        windows: tuple[StudyWindow, ...],
        remaining: tuple[TaskRemainingEffort, ...],
    ) -> AdaptationProposal:
        return self._run(lambda: self._adapt(student, period, windows, remaining))

    def apply_adaptation(
        self,
        *,
        student: ExternalRef,
        period: PlanPeriod,
        windows: tuple[StudyWindow, ...],
        remaining: tuple[TaskRemainingEffort, ...],
        record_id: PlanRecordId,
    ) -> StoredStudyPlan:
        def operation() -> StoredStudyPlan:
            student_id = student_id_for(student)
            existing = self._plans.get(record_id)
            if existing is not None:
                # Exact retry of an already-applied confirmation.
                return existing
            proposal = self._adapt(student, period, windows, remaining)
            now = self._clock.now()
            record = self._plans.save_revision(
                record_id=record_id,
                baseline_record_id=proposal.baseline.record_id,
                result=proposal.result,
                saved_at=now,
            )
            goal = self._goals.get(student_id, period)
            self._goals.save(
                replace(goal, study_windows=windows, updated_at=now)
                if goal is not None
                else WeeklyGoal(
                    student_id=student_id,
                    period=period,
                    goal_text="",
                    target_minutes=0,
                    study_windows=windows,
                    updated_at=now,
                )
            )
            return record

        return self._run(operation)

    # ---- REFLECT: deterministic weekly review ---------------------------------------------

    def review(self, student: ExternalRef, period: PlanPeriod) -> WeeklyReview:
        return self._run(lambda: self._review(student, period))

    def _review(self, student: ExternalRef, period: PlanPeriod) -> WeeklyReview:
        student_id = student_id_for(student)
        now = self._clock.now()
        tasks, assignments = self._load(student)
        by_assignment = {a.id: a for a in assignments}
        executions = [
            e
            for e in self._executions_for(student, tasks)
            if period.start <= e.ended_at <= period.end
        ]
        history = self._plans.history(student_id, period)
        plan = history[-1].plan if history else None
        scheduled = {b.task_id for b in plan.blocks} if plan else set()
        past_scheduled = (
            {b.task_id for b in plan.blocks if b.ends_at <= now} if plan else set[TaskId]()
        )
        rows: list[TaskReview] = []
        for task in tasks:
            assignment = by_assignment.get(task.assignment_id)
            if assignment is None:
                continue
            own = [e for e in executions if e.task_id == task.id]
            if not own and task.id not in scheduled and assignment.deadline < period.start:
                continue
            rows.append(
                TaskReview(
                    task=task,
                    assignment=assignment,
                    actual=sum((e.actual_duration for e in own), timedelta(0)),
                    sessions=len(own),
                    completed_this_period=any(e.outcome is ExecutionOutcome.COMPLETED for e in own),
                    scheduled=task.id in scheduled,
                    missed=task.id in past_scheduled
                    and not own
                    and task.status is not TaskStatus.COMPLETED,
                )
            )
        deadlines: list[DeadlineReview] = []
        for assignment in sorted(assignments, key=lambda a: (a.deadline, a.id)):
            if not period.start <= assignment.deadline < period.end:
                continue
            own_tasks = [t for t in tasks if t.assignment_id == assignment.id]
            open_tasks = sum(1 for t in own_tasks if t.status is not TaskStatus.COMPLETED)
            if own_tasks and open_tasks == 0:
                state = DeadlineState.DONE
            elif assignment.deadline <= now:
                state = DeadlineState.MISSED
            else:
                state = DeadlineState.UPCOMING
            deadlines.append(
                DeadlineReview(assignment=assignment, state=state, open_tasks=open_tasks)
            )
        planned = sum((b.duration for b in plan.blocks), timedelta(0)) if plan else timedelta(0)
        actual = sum((e.actual_duration for e in executions), timedelta(0))
        # Days are counted in Hanoi time (UTC+7, no DST).
        active_days = len({(e.ended_at + timedelta(hours=7)).date() for e in executions})
        strengths: list[ReviewCode] = []
        weaknesses: list[ReviewCode] = []
        completed = [r for r in rows if r.completed_this_period]
        if completed:
            strengths.append(ReviewCode.COMPLETED_TASKS)
        due = [d for d in deadlines if d.state is not DeadlineState.UPCOMING]
        if due and all(d.state is DeadlineState.DONE for d in due):
            strengths.append(ReviewCode.DEADLINES_MET)
        if active_days >= CONSISTENT_DAYS:
            strengths.append(ReviewCode.CONSISTENT_SESSIONS)
        ratios = [
            r.actual / r.task.estimated_duration
            for r in completed
            if r.task.estimated_duration > timedelta(0) and r.actual > timedelta(0)
        ]
        if any(abs(ratio - 1) <= ESTIMATE_TOLERANCE for ratio in ratios):
            strengths.append(ReviewCode.ACCURATE_ESTIMATES)
        if not executions:
            weaknesses.append(ReviewCode.NO_ACTIVITY)
        if any(r.missed for r in rows):
            weaknesses.append(ReviewCode.MISSED_SESSIONS)
        if any(d.state is DeadlineState.MISSED for d in deadlines):
            weaknesses.append(ReviewCode.DEADLINE_MISSED)
        if any(ratio > 1 + ESTIMATE_TOLERANCE for ratio in ratios):
            weaknesses.append(ReviewCode.UNDERESTIMATED)
        if executions and planned > timedelta(0) and actual < planned * LOW_FOLLOW_THROUGH_RATIO:
            weaknesses.append(ReviewCode.LOW_FOLLOW_THROUGH)
        return WeeklyReview(
            period=period,
            as_of=now,
            goal=self._goals.get(student_id, period),
            planned=planned,
            actual=actual,
            plan_revisions=len(history),
            tasks=tuple(rows),
            deadlines=tuple(deadlines),
            active_days=active_days,
            strengths=tuple(strengths),
            weaknesses=tuple(weaknesses),
        )

    # ---- NEXT WEEK: draft goal from the previous goal and confirmed reflection -------------

    def draft_goal(self, student: ExternalRef, period: PlanPeriod) -> GoalDraft:
        return self._run(lambda: self._draft(student, period))

    def _draft(self, student: ExternalRef, period: PlanPeriod) -> GoalDraft:
        student_id = student_id_for(student)
        saved = self._goals.get(student_id, period)
        if saved is not None:
            return GoalDraft(
                period=period,
                saved=True,
                goal_text=saved.goal_text,
                target_minutes=saved.target_minutes,
                study_windows=saved.study_windows,
                adjustments=(),
                previous_period=None,
            )
        previous = next(
            (
                goal
                for goal in reversed(self._goals.list_for_student(student_id))
                if goal.period.end <= period.start
            ),
            None,
        )
        if previous is None:
            return GoalDraft(
                period=period,
                saved=False,
                goal_text="",
                target_minutes=0,
                study_windows=(),
                adjustments=(),
                previous_period=None,
            )
        shift = period.start - previous.period.start
        windows = tuple(
            StudyWindow(starts_at=w.starts_at + shift, ends_at=w.ends_at + shift)
            for w in previous.study_windows
            if w.ends_at + shift <= period.end
        )
        tasks, _ = self._load(student)
        titles = {task.id: task.title for task in tasks}
        open_ids = tuple(task.id for task in tasks if task.status is not TaskStatus.COMPLETED)
        target = previous.target_minutes or int(previous.available_time.total_seconds() // 60)
        adjustments: list[Adjustment] = []
        if open_ids:
            adjustments.append(
                Adjustment(
                    code=AdjustmentCode.CARRY_OVER, detail=str(len(open_ids)), task_ids=open_ids
                )
            )
        reflections = [
            record.confirmed
            for record in self._reflections.list_for_student(student_id)
            if previous.period.start <= record.confirmed.period.start
            and record.confirmed.period.end <= period.start
        ]
        signals = [signal for item in reflections for signal in item.signals]
        workload = next(
            (s.reported for s in reversed(signals) if isinstance(s, WorkloadFeedbackSignal)), None
        )
        if workload is WorkloadFeedback.TOO_HEAVY:
            adjusted = _round_minutes(target * (1 - WORKLOAD_ADJUSTMENT))
            adjustments.append(
                Adjustment(code=AdjustmentCode.WORKLOAD_TOO_HEAVY, detail=f"{target}→{adjusted}")
            )
            target = adjusted
        elif workload is WorkloadFeedback.TOO_LIGHT:
            adjusted = _round_minutes(target * (1 + WORKLOAD_ADJUSTMENT))
            adjustments.append(
                Adjustment(code=AdjustmentCode.WORKLOAD_TOO_LIGHT, detail=f"{target}→{adjusted}")
            )
            target = adjusted
        under = [
            s
            for s in signals
            if isinstance(s, EstimationFeedbackSignal)
            and s.actual_duration > s.estimated_duration * (1 + ESTIMATE_TOLERANCE)
        ]
        if under:
            ratio = max(s.actual_duration / s.estimated_duration for s in under)
            adjustments.append(
                Adjustment(
                    code=AdjustmentCode.UNDERESTIMATED,
                    detail=str(round((ratio - 1) * 100)),
                    task_ids=tuple(s.task_id for s in under),
                )
            )
        deferred = tuple(
            dict.fromkeys(
                s.task_id
                for s in signals
                if isinstance(s, DeferredTaskSignal) and s.task_id in open_ids
            )
        )
        if deferred:
            adjustments.append(
                Adjustment(
                    code=AdjustmentCode.DEFERRED_FIRST,
                    detail=", ".join(titles[t] for t in deferred if t in titles),
                    task_ids=deferred,
                )
            )
        topics = tuple(
            dict.fromkeys(s.topic for s in signals if isinstance(s, DifficultTopicSignal))
        )
        if topics:
            adjustments.append(
                Adjustment(code=AdjustmentCode.DIFFICULT_TOPIC, detail=", ".join(topics))
            )
        return GoalDraft(
            period=period,
            saved=False,
            goal_text="",
            target_minutes=target,
            study_windows=windows,
            adjustments=tuple(adjustments),
            previous_period=previous.period,
        )

    # ---- History ---------------------------------------------------------------------------

    def goals(self, student: ExternalRef) -> tuple[WeeklyGoal, ...]:
        return self._run(lambda: self._goals.list_for_student(student_id_for(student)))
