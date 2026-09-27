"""In-memory append-only study-plan revision history."""

from datetime import datetime

from haui_compass.application.ports.persistence import (
    PersistenceError,
    PersistenceErrorCode,
)
from haui_compass.application.ports.study_plans import PlanRecordId, StoredStudyPlan
from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan
from haui_compass.domain.plans.replanning import ReplanningResult
from haui_compass.domain.students.ids import StudentId

_PlanScope = tuple[StudentId, PlanPeriod]


class InMemoryStudyPlanRepository:
    def __init__(self) -> None:
        self._records: dict[PlanRecordId, StoredStudyPlan] = {}
        self._history_ids: dict[_PlanScope, list[PlanRecordId]] = {}

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
        existing = self._existing_retry(candidate)
        if existing is not None:
            return existing

        scope = (plan.student_id, plan.period)
        if self._history_ids.get(scope):
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT,
                "an initial plan already exists for this student and period",
            )
        self._append(scope, candidate)
        return candidate

    def save_revision(
        self,
        *,
        record_id: PlanRecordId,
        baseline_record_id: PlanRecordId,
        result: ReplanningResult,
        saved_at: datetime,
    ) -> StoredStudyPlan:
        baseline = self._records.get(baseline_record_id)
        if baseline is None:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_NOT_FOUND,
                f"baseline plan record {baseline_record_id} was not found",
            )
        revised = result.revised_plan
        if revised.student_id != baseline.plan.student_id or revised.period != baseline.plan.period:
            raise PersistenceError(
                PersistenceErrorCode.PLAN_SCOPE_MISMATCH,
                "revised plan must keep the baseline student and planning period",
            )
        candidate = StoredStudyPlan(
            record_id=record_id,
            plan=revised,
            revision=baseline.revision + 1,
            parent_record_id=baseline_record_id,
            saved_at=saved_at,
            replanning_result=result,
        )
        existing = self._existing_retry(candidate)
        if existing is not None:
            return existing

        scope = (baseline.plan.student_id, baseline.plan.period)
        history = self._history_ids[scope]
        if history[-1] != baseline_record_id:
            raise PersistenceError(
                PersistenceErrorCode.STALE_PLAN_REVISION,
                f"baseline plan record {baseline_record_id} is no longer latest",
            )
        self._append(scope, candidate)
        return candidate

    def get(self, record_id: PlanRecordId) -> StoredStudyPlan | None:
        return self._records.get(record_id)

    def latest(self, student_id: StudentId, period: PlanPeriod) -> StoredStudyPlan | None:
        history = self._history_ids.get((student_id, period), ())
        return self._records[history[-1]] if history else None

    def history(self, student_id: StudentId, period: PlanPeriod) -> tuple[StoredStudyPlan, ...]:
        return tuple(
            self._records[record_id]
            for record_id in self._history_ids.get((student_id, period), ())
        )

    def _existing_retry(self, candidate: StoredStudyPlan) -> StoredStudyPlan | None:
        existing = self._records.get(candidate.record_id)
        if existing is None:
            return None
        if existing == candidate:
            return existing
        raise PersistenceError(
            PersistenceErrorCode.RECORD_CONFLICT,
            f"plan record id {candidate.record_id} already has different content",
        )

    def _append(self, scope: _PlanScope, record: StoredStudyPlan) -> None:
        self._records[record.record_id] = record
        self._history_ids.setdefault(scope, []).append(record.record_id)
