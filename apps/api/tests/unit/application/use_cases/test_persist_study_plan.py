from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID

from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.use_cases.persist_study_plan import (
    PersistInitialStudyPlan,
    PersistInitialStudyPlanRequest,
    PersistReplannedStudyPlan,
    PersistReplannedStudyPlanRequest,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan
from haui_compass.domain.plans.replanning import ReplanningResult, ReplanningSummary
from haui_compass.domain.students.ids import StudentId
from haui_compass.infrastructure.persistence.memory import InMemoryStudyPlanRepository
from support.clocks import FixedClock

START = datetime(2026, 10, 5, tzinfo=UTC)
STUDENT_ID = StudentId(UUID(int=900))
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))


def plan(generated_at: datetime) -> StudyPlan:
    return StudyPlan(
        student_id=STUDENT_ID,
        period=PERIOD,
        generated_at=generated_at,
        blocks=(),
        unplanned_tasks=(),
        planner_version=1,
    )


def replanning_result(revised_plan: StudyPlan) -> ReplanningResult:
    return ReplanningResult(
        revised_plan=revised_plan,
        effective_at=revised_plan.generated_at,
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


def test_persists_initial_then_replanned_revision_with_explicit_clock_time() -> None:
    repository = InMemoryStudyPlanRepository()
    initial_id = PlanRecordId(UUID(int=1))
    initial = PersistInitialStudyPlan(
        repository=repository,
        clock=FixedClock(START + timedelta(minutes=5)),
    ).execute(
        PersistInitialStudyPlanRequest(
            record_id=initial_id,
            plan=plan(START),
        )
    )
    revised_plan = plan(START + timedelta(hours=1))
    revised = PersistReplannedStudyPlan(
        repository=repository,
        clock=FixedClock(START + timedelta(hours=1, minutes=5)),
    ).execute(
        PersistReplannedStudyPlanRequest(
            record_id=PlanRecordId(UUID(int=2)),
            baseline_record_id=initial_id,
            result=replanning_result(revised_plan),
        )
    )

    assert initial.revision == 1
    assert initial.saved_at == START + timedelta(minutes=5)
    assert revised.revision == 2
    assert revised.parent_record_id == initial.record_id
    assert revised.saved_at == START + timedelta(hours=1, minutes=5)
    assert repository.history(STUDENT_ID, PERIOD) == (initial, revised)


def test_use_case_has_no_infrastructure_import() -> None:
    source = Path("src/haui_compass/application/use_cases/persist_study_plan.py").read_text()
    assert "haui_compass.infrastructure" not in source
