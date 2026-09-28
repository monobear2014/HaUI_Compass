"""Real PostgreSQL atomicity, restart, timezone and revision-race checks."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta, timezone
from threading import Barrier
from uuid import UUID

import pytest

from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.executions import ExecutionRecordId, StoredTaskExecution
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.record_persisted_task_execution import (
    RecordPersistedTaskExecution,
    RecordPersistedTaskExecutionRequest,
)
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan
from haui_compass.domain.plans.replanning import ReplanningResult, ReplanningSummary
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.infrastructure.persistence.postgres.executions import (
    PostgresTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.postgres.plans import PostgresStudyPlanRepository
from haui_compass.infrastructure.persistence.postgres.session import (
    PostgresPersistenceTransactionManager,
    PostgresSessionFactory,
)
from haui_compass.infrastructure.persistence.postgres.tasks import PostgresTaskRepository

DATABASE_URL = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL") or os.getenv("DATABASE_URL")


@pytest.fixture
def database_url() -> str:
    if not DATABASE_URL or not DATABASE_URL.startswith("postgresql"):
        pytest.skip("real PostgreSQL test database is not configured")
    return DATABASE_URL


def test_execution_rollback_is_real(database_url: str) -> None:
    factory = PostgresSessionFactory(database_url)
    manager = PostgresPersistenceTransactionManager(factory.session_factory)
    task_repo = PostgresTaskRepository(manager.current_session)
    execution_repo = PostgresTaskExecutionRepository(manager.current_session)
    student = ExternalRef("rollback", "student")
    task = Task(
        id=TaskId(UUID(int=800)),
        assignment_id=AssignmentId(UUID(int=801)),
        title="rollback task",
        estimated_duration=timedelta(minutes=20),
    )
    now = datetime(2026, 10, 5, 8, tzinfo=UTC)
    manager.run(
        lambda: task_repo.save(
            StoredTask(student_id=student_id_for(student), task=task, saved_at=now)
        )
    )

    class FailingTaskRepository:
        def get(self, student_id: StudentId, task_id: TaskId) -> StoredTask | None:
            return task_repo.get(student_id, task_id)

        def save(self, record: StoredTask) -> StoredTask:
            task_repo.save(record)
            raise RuntimeError("controlled task-save failure")

        def list_for_student(self, student_id: StudentId) -> tuple[StoredTask, ...]:
            return task_repo.list_for_student(student_id)

    workflow = RecordPersistedTaskExecution(
        clock=type("FixedClock", (), {"now": lambda self: now})(),
        task_repository=FailingTaskRepository(),
        execution_repository=execution_repo,
        transaction_manager=manager,
    )
    request = RecordPersistedTaskExecutionRequest(
        student=student,
        task_id=task.id,
        record_id=ExecutionRecordId(UUID(int=802)),
        started_at=now - timedelta(minutes=30),
        ended_at=now - timedelta(minutes=5),
        outcome=ExecutionOutcome.COMPLETED,
    )
    with pytest.raises(RuntimeError, match="controlled task-save failure"):
        workflow.execute(request)
    with factory.session() as session:
        assert PostgresTaskExecutionRepository(lambda: session).get(request.record_id) is None
        stored = PostgresTaskRepository(lambda: session).get(student_id_for(student), task.id)
        assert stored is not None and stored.task.status.value == "not_started"
    factory.dispose()


def test_restart_and_timezone_round_trip(database_url: str) -> None:
    factory = PostgresSessionFactory(database_url)
    manager = PostgresPersistenceTransactionManager(factory.session_factory)
    tasks = PostgresTaskRepository(manager.current_session)
    student = StudentId(UUID(int=810))
    task = Task(
        id=TaskId(UUID(int=811)),
        assignment_id=AssignmentId(UUID(int=812)),
        title="durable task",
        estimated_duration=timedelta(minutes=10),
    )
    offset_time = datetime(2026, 10, 5, 15, tzinfo=timezone(timedelta(hours=7)))
    manager.run(lambda: tasks.save(StoredTask(student_id=student, task=task, saved_at=offset_time)))
    execution = StoredTaskExecution(
        record_id=ExecutionRecordId(UUID(int=813)),
        student_id=student,
        execution=TaskExecution(
            task_id=task.id,
            started_at=datetime(2026, 10, 5, 7, tzinfo=UTC),
            ended_at=datetime(2026, 10, 5, 7, 10, tzinfo=UTC),
            outcome=ExecutionOutcome.PARTIAL,
        ),
        recorded_at=datetime(2026, 10, 5, 8, tzinfo=UTC),
    )
    plans = PostgresStudyPlanRepository(manager.current_session)
    period = PlanPeriod(
        start=datetime(2026, 10, 5, tzinfo=UTC),
        end=datetime(2026, 10, 7, tzinfo=UTC),
    )
    plan = StudyPlan(
        student_id=student,
        period=period,
        generated_at=datetime(2026, 10, 5, tzinfo=UTC),
        blocks=(),
        unplanned_tasks=(),
        planner_version=1,
    )
    manager.run(lambda: PostgresTaskExecutionRepository(manager.current_session).append(execution))
    manager.run(
        lambda: plans.save_initial(
            record_id=PlanRecordId(UUID(int=814)),
            plan=plan,
            saved_at=datetime(2026, 10, 5, 8, tzinfo=UTC),
        )
    )
    factory.dispose()
    restarted = PostgresSessionFactory(database_url)
    with restarted.session() as session:
        stored = PostgresTaskRepository(lambda: session).get(student, task.id)
        assert stored is not None
        assert stored.saved_at == datetime(2026, 10, 5, 8, tzinfo=UTC)
        assert (
            PostgresTaskExecutionRepository(lambda: session).get(execution.record_id) == execution
        )
        restored_plan = PostgresStudyPlanRepository(lambda: session).get(
            PlanRecordId(UUID(int=814))
        )
        assert restored_plan is not None and restored_plan.plan == plan
    restarted.dispose()


def test_two_sessions_allow_only_one_plan_child(database_url: str) -> None:
    factory = PostgresSessionFactory(database_url)
    student = StudentId(UUID(int=820))
    start = datetime(2026, 10, 5, tzinfo=UTC)
    period = PlanPeriod(start=start, end=start + timedelta(days=2))
    baseline = StudyPlan(
        student_id=student,
        period=period,
        generated_at=start,
        blocks=(),
        unplanned_tasks=(),
        planner_version=1,
    )
    baseline_id = PlanRecordId(UUID(int=821))
    with factory.session() as session, session.begin():
        PostgresStudyPlanRepository(lambda: session).save_initial(
            record_id=baseline_id, plan=baseline, saved_at=start
        )
    result = ReplanningResult(
        revised_plan=baseline,
        effective_at=start + timedelta(hours=1),
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
    barrier = Barrier(2)

    def worker(record_id: PlanRecordId) -> object:
        session = factory.session()
        try:
            with session.begin():
                barrier.wait()
                return PostgresStudyPlanRepository(lambda: session).save_revision(
                    record_id=record_id,
                    baseline_record_id=baseline_id,
                    result=result,
                    saved_at=start + timedelta(hours=2),
                )
        except PersistenceError as error:
            return error.code
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(worker, (PlanRecordId(UUID(int=822)), PlanRecordId(UUID(int=823)))))
    assert sum(not isinstance(item, PersistenceErrorCode) for item in results) == 1
    assert sum(item is PersistenceErrorCode.STALE_PLAN_REVISION for item in results) == 1
    with factory.session() as session:
        history = PostgresStudyPlanRepository(lambda: session).history(student, period)
        assert len(history) == 2
    factory.dispose()
