"""PostgreSQL study-plan repository and typed audit mapping."""

# mypy: ignore-errors
# SQLAlchemy's dynamically typed session expressions make strict inference noisy in this adapter;
# the domain/application contracts remain strictly typed at its public boundary.
from collections.abc import Callable
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.study_plans import PlanRecordId, StoredStudyPlan
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
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId
from haui_compass.infrastructure.persistence.postgres.mapping import duration, seconds, utc
from haui_compass.infrastructure.persistence.postgres.models import (
    PlanBlockRow,
    PlanChangeBlockRow,
    PlanChangeReasonRow,
    PlanChangeRow,
    PlanReflectionKindRow,
    PlanRow,
    PlanUnplannedRow,
    ReplanningAuditRow,
)


class PostgresStudyPlanRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def _session(self) -> Session:
        return self._session_provider()

    def save_initial(
        self, *, record_id: PlanRecordId, plan: StudyPlan, saved_at: datetime
    ) -> StoredStudyPlan:
        candidate = StoredStudyPlan(
            record_id=record_id,
            plan=plan,
            revision=1,
            parent_record_id=None,
            saved_at=saved_at,
            replanning_result=None,
        )
        if self.get(record_id) is not None:
            existing = self.get(record_id)
            if existing == candidate:
                return existing
            raise PersistenceError(PersistenceErrorCode.RECORD_CONFLICT, "plan record id conflict")
        existing_scope = self._session().scalar(
            select(PlanRow).where(
                PlanRow.student_id == plan.student_id,
                PlanRow.period_start == utc(plan.period.start),
                PlanRow.period_end == utc(plan.period.end),
            )
        )
        if existing_scope is not None:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT, "initial plan already exists"
            )
        self._insert_plan(candidate)
        return candidate

    def save_revision(
        self,
        *,
        record_id: PlanRecordId,
        baseline_record_id: PlanRecordId,
        result: ReplanningResult,
        saved_at: datetime,
    ) -> StoredStudyPlan:
        baseline = self.get(baseline_record_id)
        if baseline is None:
            raise PersistenceError(PersistenceErrorCode.RECORD_NOT_FOUND, "baseline plan not found")
        revised = result.revised_plan
        if revised.student_id != baseline.plan.student_id or revised.period != baseline.plan.period:
            raise PersistenceError(PersistenceErrorCode.PLAN_SCOPE_MISMATCH, "plan scope changed")
        # Serialize writers on the fixed baseline row. Locking a changing "latest"
        # query can use a snapshot taken before a competing writer committed.
        # The following latest query must be a separate statement after this lock.
        self._session().scalar(
            select(PlanRow).where(PlanRow.record_id == baseline_record_id).with_for_update()
        )
        existing = self.get(record_id)
        if existing is not None:
            expected = StoredStudyPlan(
                record_id=record_id,
                plan=revised,
                revision=baseline.revision + 1,
                parent_record_id=baseline_record_id,
                saved_at=saved_at,
                replanning_result=result,
            )
            if existing == expected:
                return existing
            raise PersistenceError(PersistenceErrorCode.RECORD_CONFLICT, "plan record id conflict")
        # Under READ COMMITTED this statement sees the winner's newly committed child.
        latest_row = self._session().scalar(
            select(PlanRow)
            .where(
                PlanRow.student_id == baseline.plan.student_id,
                PlanRow.period_start == utc(baseline.plan.period.start),
                PlanRow.period_end == utc(baseline.plan.period.end),
            )
            .order_by(PlanRow.revision.desc())
        )
        if latest_row is None or latest_row.record_id != baseline_record_id:
            raise PersistenceError(
                PersistenceErrorCode.STALE_PLAN_REVISION, "baseline is no longer latest"
            )
        candidate = StoredStudyPlan(
            record_id=record_id,
            plan=revised,
            revision=baseline.revision + 1,
            parent_record_id=baseline_record_id,
            saved_at=saved_at,
            replanning_result=result,
        )
        self._insert_plan(candidate)
        return candidate

    def get(self, record_id: PlanRecordId) -> StoredStudyPlan | None:
        row = self._session().get(PlanRow, record_id)
        return None if row is None else self._to_stored(row)

    def latest(self, student_id: StudentId, period: PlanPeriod) -> StoredStudyPlan | None:
        row = self._session().scalar(
            select(PlanRow)
            .where(
                PlanRow.student_id == student_id,
                PlanRow.period_start == utc(period.start),
                PlanRow.period_end == utc(period.end),
            )
            .order_by(PlanRow.revision.desc())
        )
        return None if row is None else self._to_stored(row)

    def history(self, student_id: StudentId, period: PlanPeriod) -> tuple[StoredStudyPlan, ...]:
        rows = self._session().scalars(
            select(PlanRow)
            .where(
                PlanRow.student_id == student_id,
                PlanRow.period_start == utc(period.start),
                PlanRow.period_end == utc(period.end),
            )
            .order_by(PlanRow.revision)
        )
        return tuple(self._to_stored(row) for row in rows)

    def _insert_plan(self, record: StoredStudyPlan) -> None:
        session = self._session()
        plan = record.plan
        session.add(
            PlanRow(
                record_id=record.record_id,
                student_id=plan.student_id,
                period_start=utc(plan.period.start),
                period_end=utc(plan.period.end),
                revision=record.revision,
                parent_record_id=record.parent_record_id,
                generated_at=utc(plan.generated_at),
                saved_at=utc(record.saved_at),
                planner_version=plan.planner_version,
            )
        )
        session.flush()
        for position, block in enumerate(plan.blocks):
            session.add(
                PlanBlockRow(
                    plan_record_id=record.record_id,
                    position=position,
                    task_id=block.task_id,
                    starts_at=utc(block.starts_at),
                    ends_at=utc(block.ends_at),
                )
            )
        for item in plan.unplanned_tasks:
            session.add(
                PlanUnplannedRow(
                    plan_record_id=record.record_id,
                    task_id=item.task_id,
                    remaining_seconds=seconds(item.remaining_effort),
                    reason=item.reason.value,
                )
            )
        if record.replanning_result is not None:
            self._insert_audit(record.record_id, record.replanning_result)
        session.flush()

    def _insert_audit(self, record_id, result: ReplanningResult) -> None:
        session = self._session()
        summary = result.summary
        session.add(
            ReplanningAuditRow(
                record_id=record_id,
                effective_at=utc(result.effective_at),
                replanner_version=result.replanner_version,
                historical_block_count=summary.historical_block_count,
                crossing_block_count=summary.crossing_block_count,
                preserved_future_block_count=summary.preserved_future_block_count,
                removed_future_block_count=summary.removed_future_block_count,
                added_future_block_count=summary.added_future_block_count,
                moved_seconds=seconds(summary.moved_duration),
                newly_unplanned_seconds=seconds(summary.newly_unplanned_duration),
                execution_context_task_count=summary.execution_context_task_count,
            )
        )
        session.flush()
        for kind in result.informational_reflection_signals:
            session.add(PlanReflectionKindRow(record_id=record_id, kind=kind.value))
        for change in result.changes:
            row = PlanChangeRow(
                record_id=record_id,
                task_id=change.task_id,
                baseline_unplanned_seconds=seconds(change.baseline_unplanned_effort),
                baseline_unplanned_reason=(
                    change.baseline_unplanned_reason.value
                    if change.baseline_unplanned_reason is not None
                    else None
                ),
                revised_unplanned_seconds=seconds(change.revised_unplanned_effort),
                revised_unplanned_reason=(
                    change.revised_unplanned_reason.value
                    if change.revised_unplanned_reason is not None
                    else None
                ),
                had_execution_activity=change.had_execution_activity,
            )
            session.add(row)
            session.flush()
            for reason in change.reasons:
                session.add(PlanChangeReasonRow(change_id=row.id, reason=reason.value))
            for side, blocks in (
                ("baseline", change.baseline_future_blocks),
                ("revised", change.revised_future_blocks),
            ):
                for position, block in enumerate(blocks):
                    session.add(
                        PlanChangeBlockRow(
                            change_id=row.id,
                            side=side,
                            position=position,
                            task_id=block.task_id,
                            starts_at=utc(block.starts_at),
                            ends_at=utc(block.ends_at),
                        )
                    )

    def _to_stored(self, row: PlanRow) -> StoredStudyPlan:
        session = self._session()
        blocks = tuple(
            StudyBlock(
                task_id=TaskId(item.task_id),
                starts_at=utc(item.starts_at),
                ends_at=utc(item.ends_at),
            )
            for item in session.scalars(
                select(PlanBlockRow)
                .where(PlanBlockRow.plan_record_id == row.record_id)
                .order_by(PlanBlockRow.position)
            )
        )
        unplanned = tuple(
            UnplannedTask(
                task_id=TaskId(item.task_id),
                remaining_effort=duration(item.remaining_seconds),
                reason=UnplannedReason(item.reason),
            )
            for item in session.scalars(
                select(PlanUnplannedRow)
                .where(PlanUnplannedRow.plan_record_id == row.record_id)
                .order_by(PlanUnplannedRow.task_id)
            )
        )
        plan = StudyPlan(
            student_id=StudentId(row.student_id),
            period=PlanPeriod(start=utc(row.period_start), end=utc(row.period_end)),
            generated_at=utc(row.generated_at),
            blocks=blocks,
            unplanned_tasks=unplanned,
            planner_version=row.planner_version,
        )
        result = self._to_result(row.record_id, plan) if row.revision > 1 else None
        return StoredStudyPlan(
            record_id=PlanRecordId(row.record_id),
            plan=plan,
            revision=row.revision,
            parent_record_id=(PlanRecordId(row.parent_record_id) if row.parent_record_id else None),
            saved_at=utc(row.saved_at),
            replanning_result=result,
        )

    def _to_result(self, record_id, revised_plan):
        session = self._session()
        audit = session.get(ReplanningAuditRow, record_id)
        if audit is None:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT, "replanning audit is missing"
            )
        changes = []
        for row in session.scalars(
            select(PlanChangeRow).where(PlanChangeRow.record_id == record_id)
        ):
            reasons = tuple(
                PlanChangeReason(reason.reason)
                for reason in session.scalars(
                    select(PlanChangeReasonRow)
                    .where(PlanChangeReasonRow.change_id == row.id)
                    .order_by(PlanChangeReasonRow.id)
                )
            )
            grouped: dict[str, list[StudyBlock]] = {"baseline": [], "revised": []}
            for block in session.scalars(
                select(PlanChangeBlockRow)
                .where(PlanChangeBlockRow.change_id == row.id)
                .order_by(PlanChangeBlockRow.position)
            ):
                grouped[block.side].append(
                    StudyBlock(
                        task_id=TaskId(block.task_id),
                        starts_at=utc(block.starts_at),
                        ends_at=utc(block.ends_at),
                    )
                )
            changes.append(
                PlanChange(
                    task_id=TaskId(row.task_id),
                    reasons=reasons,
                    baseline_future_blocks=tuple(grouped["baseline"]),
                    revised_future_blocks=tuple(grouped["revised"]),
                    baseline_unplanned_effort=duration(row.baseline_unplanned_seconds),
                    revised_unplanned_effort=duration(row.revised_unplanned_seconds),
                    baseline_unplanned_reason=(
                        UnplannedReason(row.baseline_unplanned_reason)
                        if row.baseline_unplanned_reason
                        else None
                    ),
                    revised_unplanned_reason=(
                        UnplannedReason(row.revised_unplanned_reason)
                        if row.revised_unplanned_reason
                        else None
                    ),
                    had_execution_activity=row.had_execution_activity,
                )
            )
        summary = ReplanningSummary(
            historical_block_count=audit.historical_block_count,
            crossing_block_count=audit.crossing_block_count,
            preserved_future_block_count=audit.preserved_future_block_count,
            removed_future_block_count=audit.removed_future_block_count,
            added_future_block_count=audit.added_future_block_count,
            moved_duration=duration(audit.moved_seconds),
            newly_unplanned_duration=duration(audit.newly_unplanned_seconds),
            execution_context_task_count=audit.execution_context_task_count,
        )
        kinds = tuple(
            ReflectionSignalKind(kind.kind)
            for kind in session.scalars(
                select(PlanReflectionKindRow).where(PlanReflectionKindRow.record_id == record_id)
            )
        )
        return ReplanningResult(
            revised_plan=revised_plan,
            effective_at=utc(audit.effective_at),
            changes=tuple(changes),
            summary=summary,
            informational_reflection_signals=kinds,
            replanner_version=audit.replanner_version,
        )
