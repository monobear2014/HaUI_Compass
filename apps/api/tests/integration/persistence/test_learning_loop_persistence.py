from datetime import UTC, datetime, timedelta
from uuid import UUID

from haui_compass.application.ports.executions import (
    ExecutionRecordId,
    StoredTaskExecution,
)
from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    StoredConfirmedReflection,
)
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.confirm_reflection_signals import (
    ConfirmReflectionSignals,
    ConfirmReflectionSignalsRequest,
)
from haui_compass.application.use_cases.generate_weekly_plan import (
    GenerateWeeklyPlan,
    GenerateWeeklyPlanRequest,
)
from haui_compass.application.use_cases.persist_study_plan import (
    PersistInitialStudyPlan,
    PersistInitialStudyPlanRequest,
    PersistReplannedStudyPlan,
    PersistReplannedStudyPlanRequest,
)
from haui_compass.application.use_cases.record_task_execution import (
    RecordTaskExecution,
    RecordTaskExecutionRequest,
)
from haui_compass.application.use_cases.replan_study_plan import (
    ReplanStudyPlan,
    ReplanStudyPlanRequest,
)
from haui_compass.application.use_cases.submit_reflection import (
    SubmitReflection,
    SubmitReflectionRequest,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.plans.replanning import TaskRemainingEffort
from haui_compass.domain.reflections.reflection import ReflectionPeriod, ReflectionResponses
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome
from haui_compass.domain.tasks.task import TaskStatus
from haui_compass.engines.execution.summary import summarize_task_executions
from haui_compass.infrastructure.persistence.memory import (
    InMemoryConfirmedReflectionRepository,
    InMemoryStudyPlanRepository,
    InMemoryTaskExecutionRepository,
    InMemoryTaskRepository,
)
from support.builders import make_assignment, make_task
from support.clocks import FixedClock

START = datetime(2026, 10, 5, tzinfo=UTC)
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))
STUDENT_ID = StudentId(UUID(int=900))


def at(*, day: int = 0, hour: int = 0, minute: int = 0) -> datetime:
    return START + timedelta(days=day, hours=hour, minutes=minute)


def test_plan_do_reflect_adapt_history_survives_across_calls() -> None:
    tasks = InMemoryTaskRepository()
    executions = InMemoryTaskExecutionRepository()
    reflections = InMemoryConfirmedReflectionRepository()
    plans = InMemoryStudyPlanRepository()
    assignment = make_assignment(1, deadline=at(day=6))
    task = make_task(1, 1, minutes=120)
    tasks.save(StoredTask(student_id=STUDENT_ID, task=task, saved_at=START))

    baseline_window = StudyWindow(starts_at=at(day=1, hour=19), ends_at=at(day=1, hour=21))
    baseline_plan = GenerateWeeklyPlan().execute(
        GenerateWeeklyPlanRequest(
            student_id=STUDENT_ID,
            tasks=(task,),
            assignments=(assignment,),
            period=PERIOD,
            study_windows=(baseline_window,),
            generated_at=START,
        )
    )
    baseline_id = PlanRecordId(UUID(int=100))
    stored_baseline = PersistInitialStudyPlan(
        repository=plans,
        clock=FixedClock(START + timedelta(minutes=5)),
    ).execute(PersistInitialStudyPlanRequest(record_id=baseline_id, plan=baseline_plan))

    recorded = RecordTaskExecution().execute(
        RecordTaskExecutionRequest(
            task=task,
            started_at=at(day=1, hour=19),
            ended_at=at(day=1, hour=19, minute=30),
            outcome=ExecutionOutcome.PARTIAL,
        )
    )
    execution_record = StoredTaskExecution(
        record_id=ExecutionRecordId(UUID(int=200)),
        student_id=STUDENT_ID,
        execution=recorded.execution,
        recorded_at=recorded.execution.ended_at,
    )
    executions.append(execution_record)
    tasks.save(
        StoredTask(
            student_id=STUDENT_ID,
            task=recorded.updated_task,
            saved_at=at(day=1, hour=19, minute=35),
        )
    )

    reflection_period = ReflectionPeriod(start=START, end=at(day=2, hour=10))
    reflection = SubmitReflection(clock=FixedClock(at(day=2, hour=11))).execute(
        SubmitReflectionRequest(
            student_id=STUDENT_ID,
            period=reflection_period,
            responses=ReflectionResponses(
                reflected_task_ids=(task.id,),
                deferred_task_ids=(task.id,),
            ),
            tasks=(recorded.updated_task,),
            task_executions=(recorded.execution,),
        )
    )
    confirmed = (
        ConfirmReflectionSignals(clock=FixedClock(at(day=2, hour=11, minute=5)))
        .execute(
            ConfirmReflectionSignalsRequest(
                candidate=reflection.candidate_signals,
                selected_signals=reflection.candidate_signals.signals,
            )
        )
        .confirmed
    )
    reflection_record = StoredConfirmedReflection(
        record_id=ConfirmedReflectionRecordId(UUID(int=300)),
        confirmed=confirmed,
        saved_at=at(day=2, hour=11, minute=10),
    )
    reflections.append(reflection_record)

    effective_at = at(day=2, hour=12)
    revised_window = StudyWindow(
        starts_at=at(day=3, hour=19),
        ends_at=at(day=3, hour=21),
    )
    replanning_result = ReplanStudyPlan().execute(
        ReplanStudyPlanRequest(
            baseline_plan=stored_baseline.plan,
            tasks=(recorded.updated_task,),
            assignments=(assignment,),
            study_windows=(revised_window,),
            remaining_efforts=(
                TaskRemainingEffort(
                    task_id=task.id,
                    remaining_duration=timedelta(minutes=90),
                ),
            ),
            execution_summaries=(summarize_task_executions((recorded.execution,)),),
            confirmed_reflections=(confirmed,),
            effective_at=effective_at,
        )
    )
    revision_id = PlanRecordId(UUID(int=101))
    stored_revision = PersistReplannedStudyPlan(
        repository=plans,
        clock=FixedClock(effective_at + timedelta(minutes=5)),
    ).execute(
        PersistReplannedStudyPlanRequest(
            record_id=revision_id,
            baseline_record_id=baseline_id,
            result=replanning_result,
        )
    )

    assert stored_baseline.revision == 1
    assert stored_revision.revision == 2
    assert stored_revision.parent_record_id == baseline_id
    assert stored_revision.replanning_result == replanning_result
    assert plans.latest(STUDENT_ID, PERIOD) == stored_revision
    assert plans.history(STUDENT_ID, PERIOD) == (stored_baseline, stored_revision)
    assert plans.get(baseline_id) == stored_baseline
    assert plans.get(revision_id) == stored_revision

    stored_task = tasks.get(STUDENT_ID, task.id)
    assert stored_task is not None
    assert stored_task.task.status is TaskStatus.IN_PROGRESS
    assert executions.list_for_task(STUDENT_ID, task.id) == (execution_record,)
    assert reflections.list_for_student(STUDENT_ID) == (reflection_record,)
    assert stored_revision.plan.blocks[-1].duration == timedelta(minutes=90)
