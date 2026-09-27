from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

import pytest

from haui_compass.application.ports.executions import ExecutionRecordId, StoredTaskExecution
from haui_compass.application.ports.reflections import (
    ConfirmedReflectionRecordId,
    StoredConfirmedReflection,
)
from haui_compass.application.ports.study_plans import PlanRecordId, StoredStudyPlan
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan
from haui_compass.domain.reflections.reflection import ReflectionPeriod
from haui_compass.domain.reflections.signals import ConfirmedReflectionSignals
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome, TaskExecution
from support.builders import make_task, task_id

START = datetime(2026, 10, 5, tzinfo=UTC)
STUDENT_ID = StudentId(task_id(900))


def plan() -> StudyPlan:
    return StudyPlan(
        student_id=STUDENT_ID,
        period=PlanPeriod(start=START, end=START + timedelta(days=7)),
        generated_at=START,
        blocks=(),
        unplanned_tasks=(),
        planner_version=1,
    )


def test_persistence_timestamps_are_normalized_to_utc() -> None:
    vietnam = timezone(timedelta(hours=7))
    record = StoredTask(
        student_id=STUDENT_ID,
        task=make_task(1, 1),
        saved_at=START.astimezone(vietnam),
    )
    assert record.saved_at == START
    assert record.saved_at.tzinfo is UTC


def test_execution_record_cannot_be_saved_before_execution_ends() -> None:
    execution = TaskExecution(
        task_id=task_id(1),
        started_at=START,
        ended_at=START + timedelta(hours=1),
        outcome=ExecutionOutcome.PARTIAL,
    )
    with pytest.raises(DomainValidationError, match="must not precede execution end"):
        StoredTaskExecution(
            record_id=ExecutionRecordId(UUID(int=1)),
            student_id=STUDENT_ID,
            execution=execution,
            recorded_at=START,
        )


def test_confirmed_reflection_cannot_be_saved_before_confirmation() -> None:
    confirmed = ConfirmedReflectionSignals(
        student_id=STUDENT_ID,
        period=ReflectionPeriod(start=START, end=START + timedelta(hours=1)),
        confirmed_at=START + timedelta(hours=2),
        signals=(),
    )
    with pytest.raises(DomainValidationError, match="must not precede confirmation"):
        StoredConfirmedReflection(
            record_id=ConfirmedReflectionRecordId(UUID(int=1)),
            confirmed=confirmed,
            saved_at=START + timedelta(hours=1),
        )


def test_initial_plan_record_has_revision_one_without_parent_or_audit() -> None:
    stored = StoredStudyPlan(
        record_id=PlanRecordId(UUID(int=1)),
        plan=plan(),
        revision=1,
        parent_record_id=None,
        saved_at=START,
        replanning_result=None,
    )
    assert stored.revision == 1


@pytest.mark.parametrize("revision", [0, -1])
def test_plan_revision_must_be_positive(revision: int) -> None:
    with pytest.raises(DomainValidationError, match="at least 1"):
        StoredStudyPlan(
            record_id=PlanRecordId(UUID(int=1)),
            plan=plan(),
            revision=revision,
            parent_record_id=None,
            saved_at=START,
            replanning_result=None,
        )


def test_initial_plan_cannot_claim_parent_without_audit() -> None:
    with pytest.raises(DomainValidationError, match="initial StoredStudyPlan"):
        StoredStudyPlan(
            record_id=PlanRecordId(UUID(int=2)),
            plan=plan(),
            revision=1,
            parent_record_id=PlanRecordId(UUID(int=1)),
            saved_at=START,
            replanning_result=None,
        )
