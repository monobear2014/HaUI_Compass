"""The same repository contracts run against a disposable real PostgreSQL database."""

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    StoredConfirmedReflection,
)
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.domain.plans.plan import (
    PlanPeriod,
    StudyBlock,
    StudyPlan,
    UnplannedReason,
    UnplannedTask,
)
from haui_compass.domain.plans.replanning import (
    PlanChange,
    PlanChangeReason,
    ReflectionSignalKind,
    ReplanningResult,
    ReplanningSummary,
)
from haui_compass.domain.reflections.reflection import ReflectionPeriod, WorkloadFeedback
from haui_compass.domain.reflections.signals import (
    ConfirmedReflectionSignals,
    DeferredTaskSignal,
    DifficultTopicSignal,
    EstimationFeedbackSignal,
    WorkloadFeedbackSignal,
)
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId
from haui_compass.infrastructure.persistence.postgres.executions import (
    PostgresTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.postgres.plans import PostgresStudyPlanRepository
from haui_compass.infrastructure.persistence.postgres.reflections import (
    PostgresConfirmedReflectionRepository,
)
from haui_compass.infrastructure.persistence.postgres.tasks import PostgresTaskRepository
from support.persistence_contracts import (
    assert_execution_repository_contract,
    assert_reflection_repository_contract,
    assert_study_plan_repository_contract,
    assert_task_repository_contract,
)

DATABASE_URL = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")


@pytest.fixture
def postgres_session() -> Iterator[Session]:
    if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    config = Config("alembic.ini")
    os.environ["HAUI_COMPASS_DATABASE_URL"] = DATABASE_URL
    command.upgrade(config, "head")
    engine = create_engine(DATABASE_URL, future=True)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
    engine.dispose()


def test_task_repository_contract(postgres_session: Session) -> None:
    assert_task_repository_contract(lambda: PostgresTaskRepository(lambda: postgres_session))


def test_execution_repository_contract(postgres_session: Session) -> None:
    assert_execution_repository_contract(
        lambda: PostgresTaskExecutionRepository(lambda: postgres_session)
    )


def test_reflection_repository_contract(postgres_session: Session) -> None:
    assert_reflection_repository_contract(
        lambda: PostgresConfirmedReflectionRepository(lambda: postgres_session)
    )


def test_study_plan_repository_contract(postgres_session: Session) -> None:
    assert_study_plan_repository_contract(
        lambda: PostgresStudyPlanRepository(lambda: postgres_session)
    )


def test_typed_plan_and_reflection_round_trip(postgres_session: Session) -> None:
    student = StudentId(UUID(int=777))
    start = datetime(2026, 10, 5, tzinfo=UTC)
    period = PlanPeriod(start=start, end=start + timedelta(days=2))
    task = TaskId(UUID(int=10))
    baseline_block = StudyBlock(
        task_id=task, starts_at=start + timedelta(hours=1), ends_at=start + timedelta(hours=2)
    )
    baseline = StudyPlan(
        student_id=student,
        period=period,
        generated_at=start,
        blocks=(baseline_block,),
        unplanned_tasks=(
            UnplannedTask(
                task_id=TaskId(UUID(int=11)),
                remaining_effort=timedelta(minutes=30),
                reason=UnplannedReason.INSUFFICIENT_CAPACITY,
            ),
        ),
        planner_version=1,
    )
    plans = PostgresStudyPlanRepository(lambda: postgres_session)
    baseline_id = PlanRecordId(UUID(int=700))
    assert plans.save_initial(record_id=baseline_id, plan=baseline, saved_at=start) == plans.get(
        baseline_id
    )
    revised_block = StudyBlock(
        task_id=task, starts_at=start + timedelta(hours=3), ends_at=start + timedelta(hours=4)
    )
    revised = StudyPlan(
        student_id=student,
        period=period,
        generated_at=start + timedelta(minutes=5),
        blocks=(revised_block,),
        unplanned_tasks=(),
        planner_version=1,
    )
    result = ReplanningResult(
        revised_plan=revised,
        effective_at=start + timedelta(minutes=10),
        changes=(
            PlanChange(
                task_id=task,
                reasons=(PlanChangeReason.STUDY_WINDOW_CHANGED,),
                baseline_future_blocks=(baseline_block,),
                revised_future_blocks=(revised_block,),
                baseline_unplanned_effort=timedelta(0),
                revised_unplanned_effort=timedelta(0),
                baseline_unplanned_reason=None,
                revised_unplanned_reason=None,
                had_execution_activity=True,
            ),
        ),
        summary=ReplanningSummary(
            historical_block_count=0,
            crossing_block_count=0,
            preserved_future_block_count=0,
            removed_future_block_count=1,
            added_future_block_count=1,
            moved_duration=timedelta(hours=1),
            newly_unplanned_duration=timedelta(0),
            execution_context_task_count=1,
        ),
        informational_reflection_signals=(ReflectionSignalKind.DEFERRED_TASK,),
        replanner_version=1,
    )
    revision_id = PlanRecordId(UUID(int=701))
    stored = plans.save_revision(
        record_id=revision_id,
        baseline_record_id=baseline_id,
        result=result,
        saved_at=start + timedelta(minutes=20),
    )
    assert plans.get(revision_id) == stored
    assert stored.replanning_result == result

    reflections = PostgresConfirmedReflectionRepository(lambda: postgres_session)
    confirmed = ConfirmedReflectionSignals(
        student_id=student,
        period=ReflectionPeriod(start=start, end=start + timedelta(hours=1)),
        confirmed_at=start + timedelta(hours=2),
        signals=(
            EstimationFeedbackSignal(
                task_id=task,
                estimated_duration=timedelta(minutes=20),
                actual_duration=timedelta(minutes=25),
            ),
            WorkloadFeedbackSignal(reported=WorkloadFeedback.TOO_HEAVY),
            DifficultTopicSignal(topic="joins"),
            DeferredTaskSignal(task_id=task),
        ),
    )
    reflection = StoredConfirmedReflection(
        record_id=ConfirmedReflectionRecordId(UUID(int=702)),
        confirmed=confirmed,
        saved_at=start + timedelta(hours=2, minutes=1),
    )
    assert reflections.append(reflection) == reflection
    assert reflections.get(reflection.record_id) == reflection
