"""Reusable behavioral contracts for every persistence adapter implementation."""

from collections.abc import Callable
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from haui_compass.application.ports.executions import (
    ExecutionRecordId,
    StoredTaskExecution,
    TaskExecutionRepository,
)
from haui_compass.application.ports.persistence import (
    PersistenceError,
    PersistenceErrorCode,
)
from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    ConfirmedReflectionRepository,
    StoredConfirmedReflection,
)
from haui_compass.application.ports.study_plans import (
    PlanRecordId,
    StudyPlanRepository,
)
from haui_compass.application.ports.tasks import StoredTask, TaskRepository
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan
from haui_compass.domain.plans.replanning import (
    ReplanningResult,
    ReplanningSummary,
)
from haui_compass.domain.reflections.reflection import ReflectionPeriod
from haui_compass.domain.reflections.signals import (
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import TaskStatus
from support.builders import make_task, task_id

START = datetime(2026, 10, 5, tzinfo=UTC)
STUDENT_A = StudentId(UUID(int=900))
STUDENT_B = StudentId(UUID(int=901))

TaskRepositoryFactory = Callable[[], TaskRepository]
ExecutionRepositoryFactory = Callable[[], TaskExecutionRepository]
ReflectionRepositoryFactory = Callable[[], ConfirmedReflectionRepository]
StudyPlanRepositoryFactory = Callable[[], StudyPlanRepository]


def assert_task_repository_contract(factory: TaskRepositoryFactory) -> None:
    repository = factory()
    task_two = StoredTask(
        student_id=STUDENT_A,
        task=make_task(2, 2),
        saved_at=START,
    )
    task_one = StoredTask(
        student_id=STUDENT_A,
        task=make_task(1, 1),
        saved_at=START,
    )
    repository.save(task_two)
    repository.save(task_one)

    assert repository.get(STUDENT_A, task_one.task.id) == task_one
    assert repository.get(STUDENT_B, task_one.task.id) is None
    assert repository.list_for_student(STUDENT_A) == (task_one, task_two)
    assert repository.list_for_student(STUDENT_B) == ()

    updated = StoredTask(
        student_id=STUDENT_A,
        task=replace(task_one.task, status=TaskStatus.IN_PROGRESS),
        saved_at=START + timedelta(hours=1),
    )
    assert repository.save(updated) == updated
    assert repository.get(STUDENT_A, task_one.task.id) == updated

    with pytest.raises(PersistenceError) as error:
        repository.save(
            StoredTask(
                student_id=STUDENT_B,
                task=task_one.task,
                saved_at=START + timedelta(hours=2),
            )
        )
    assert error.value.code is PersistenceErrorCode.OWNERSHIP_CONFLICT


def assert_execution_repository_contract(factory: ExecutionRepositoryFactory) -> None:
    repository = factory()
    later = _stored_execution(record_n=2, task_n=1, student_id=STUDENT_A, hour=3)
    earlier = _stored_execution(record_n=1, task_n=1, student_id=STUDENT_A, hour=1)
    other_task = _stored_execution(record_n=3, task_n=2, student_id=STUDENT_A, hour=2)
    other_student = _stored_execution(record_n=4, task_n=1, student_id=STUDENT_B, hour=2)
    for record in (later, other_student, other_task, earlier):
        repository.append(record)

    assert repository.get(earlier.record_id) == earlier
    assert repository.list_for_task(STUDENT_A, task_id(1)) == (earlier, later)
    assert repository.list_for_task(STUDENT_A, task_id(2)) == (other_task,)
    assert repository.list_for_task(STUDENT_B, task_id(1)) == (other_student,)

    assert repository.append(earlier) == earlier
    assert repository.list_for_task(STUDENT_A, task_id(1)) == (earlier, later)
    conflicting = replace(
        earlier,
        execution=replace(earlier.execution, outcome=ExecutionOutcome.COMPLETED),
    )
    with pytest.raises(PersistenceError) as error:
        repository.append(conflicting)
    assert error.value.code is PersistenceErrorCode.RECORD_CONFLICT


def assert_reflection_repository_contract(factory: ReflectionRepositoryFactory) -> None:
    repository = factory()
    later = _stored_reflection(record_n=2, student_id=STUDENT_A, confirmed_hour=4)
    earlier = _stored_reflection(record_n=1, student_id=STUDENT_A, confirmed_hour=2)
    other_student = _stored_reflection(record_n=3, student_id=STUDENT_B, confirmed_hour=3)
    for record in (later, other_student, earlier):
        repository.append(record)

    assert repository.get(earlier.record_id) == earlier
    assert repository.list_for_student(STUDENT_A) == (earlier, later)
    assert repository.list_for_student(STUDENT_B) == (other_student,)
    assert repository.append(earlier) == earlier
    assert repository.list_for_student(STUDENT_A) == (earlier, later)

    conflicting = replace(earlier, saved_at=earlier.saved_at + timedelta(minutes=1))
    with pytest.raises(PersistenceError) as error:
        repository.append(conflicting)
    assert error.value.code is PersistenceErrorCode.RECORD_CONFLICT


def assert_study_plan_repository_contract(factory: StudyPlanRepositoryFactory) -> None:
    repository = factory()
    period = PlanPeriod(start=START, end=START + timedelta(days=7))
    baseline_plan = _plan(STUDENT_A, period, generated_at=START)
    baseline_id = PlanRecordId(UUID(int=1))
    initial = repository.save_initial(
        record_id=baseline_id,
        plan=baseline_plan,
        saved_at=START,
    )
    assert initial.revision == 1
    assert initial.parent_record_id is None
    assert repository.get(baseline_id) == initial
    assert repository.latest(STUDENT_A, period) == initial
    assert repository.history(STUDENT_A, period) == (initial,)

    assert (
        repository.save_initial(
            record_id=baseline_id,
            plan=baseline_plan,
            saved_at=START,
        )
        == initial
    )
    assert repository.history(STUDENT_A, period) == (initial,)

    revised_plan = _plan(
        STUDENT_A,
        period,
        generated_at=START + timedelta(hours=1),
    )
    result = _replanning_result(revised_plan, effective_at=START + timedelta(hours=1))
    revision_id = PlanRecordId(UUID(int=2))
    revision = repository.save_revision(
        record_id=revision_id,
        baseline_record_id=baseline_id,
        result=result,
        saved_at=START + timedelta(hours=2),
    )
    assert revision.revision == 2
    assert revision.parent_record_id == baseline_id
    assert revision.replanning_result == result
    assert repository.latest(STUDENT_A, period) == revision
    assert repository.history(STUDENT_A, period) == (initial, revision)
    assert repository.get(baseline_id) == initial

    assert (
        repository.save_revision(
            record_id=revision_id,
            baseline_record_id=baseline_id,
            result=result,
            saved_at=START + timedelta(hours=2),
        )
        == revision
    )
    assert repository.history(STUDENT_A, period) == (initial, revision)

    with pytest.raises(PersistenceError) as stale:
        repository.save_revision(
            record_id=PlanRecordId(UUID(int=3)),
            baseline_record_id=baseline_id,
            result=result,
            saved_at=START + timedelta(hours=3),
        )
    assert stale.value.code is PersistenceErrorCode.STALE_PLAN_REVISION

    with pytest.raises(PersistenceError) as conflict:
        repository.save_initial(
            record_id=PlanRecordId(UUID(int=4)),
            plan=baseline_plan,
            saved_at=START + timedelta(hours=3),
        )
    assert conflict.value.code is PersistenceErrorCode.RECORD_CONFLICT

    with pytest.raises(PersistenceError) as missing:
        repository.save_revision(
            record_id=PlanRecordId(UUID(int=40)),
            baseline_record_id=PlanRecordId(UUID(int=404)),
            result=result,
            saved_at=START + timedelta(hours=3),
        )
    assert missing.value.code is PersistenceErrorCode.RECORD_NOT_FOUND

    wrong_student_plan = _plan(
        STUDENT_B,
        period,
        generated_at=START + timedelta(hours=2),
    )
    with pytest.raises(PersistenceError) as scope_mismatch:
        repository.save_revision(
            record_id=PlanRecordId(UUID(int=41)),
            baseline_record_id=revision_id,
            result=_replanning_result(
                wrong_student_plan,
                effective_at=START + timedelta(hours=2),
            ),
            saved_at=START + timedelta(hours=3),
        )
    assert scope_mismatch.value.code is PersistenceErrorCode.PLAN_SCOPE_MISMATCH

    other_period = PlanPeriod(
        start=period.end,
        end=period.end + timedelta(days=7),
    )
    other_period_plan = _plan(STUDENT_A, other_period, generated_at=period.end)
    other_period_record = repository.save_initial(
        record_id=PlanRecordId(UUID(int=5)),
        plan=other_period_plan,
        saved_at=period.end,
    )
    other_student_plan = _plan(STUDENT_B, period, generated_at=START)
    other_student_record = repository.save_initial(
        record_id=PlanRecordId(UUID(int=6)),
        plan=other_student_plan,
        saved_at=START,
    )
    assert repository.latest(STUDENT_A, other_period) == other_period_record
    assert repository.latest(STUDENT_B, period) == other_student_record
    assert repository.history(STUDENT_B, other_period) == ()


def _stored_execution(
    *, record_n: int, task_n: int, student_id: StudentId, hour: int
) -> StoredTaskExecution:
    started_at = START + timedelta(hours=hour)
    execution = TaskExecution(
        task_id=task_id(task_n),
        started_at=started_at,
        ended_at=started_at + timedelta(minutes=30),
        outcome=ExecutionOutcome.PARTIAL,
    )
    return StoredTaskExecution(
        record_id=ExecutionRecordId(UUID(int=record_n)),
        student_id=student_id,
        execution=execution,
        recorded_at=execution.ended_at,
    )


def _stored_reflection(
    *, record_n: int, student_id: StudentId, confirmed_hour: int
) -> StoredConfirmedReflection:
    confirmed_at = START + timedelta(hours=confirmed_hour)
    confirmed = ConfirmedReflectionSignals(
        student_id=student_id,
        period=ReflectionPeriod(start=START, end=START + timedelta(hours=1)),
        confirmed_at=confirmed_at,
        signals=(DeferredTaskSignal(task_id=task_id(1)),),
    )
    return StoredConfirmedReflection(
        record_id=ConfirmedReflectionRecordId(UUID(int=record_n)),
        confirmed=confirmed,
        saved_at=confirmed_at,
    )


def _plan(student_id: StudentId, period: PlanPeriod, *, generated_at: datetime) -> StudyPlan:
    return StudyPlan(
        student_id=student_id,
        period=period,
        generated_at=generated_at,
        blocks=(),
        unplanned_tasks=(),
        planner_version=1,
    )


def _replanning_result(plan: StudyPlan, *, effective_at: datetime) -> ReplanningResult:
    return ReplanningResult(
        revised_plan=plan,
        effective_at=effective_at,
        changes=(),
        summary=ReplanningSummary(
            historical_block_count=0,
            crossing_block_count=0,
            preserved_future_block_count=0,
            removed_future_block_count=0,
            added_future_block_count=0,
            moved_duration=timedelta(0),
            newly_unplanned_duration=timedelta(0),
            execution_context_task_count=0,
        ),
        informational_reflection_signals=(),
        replanner_version=1,
    )
