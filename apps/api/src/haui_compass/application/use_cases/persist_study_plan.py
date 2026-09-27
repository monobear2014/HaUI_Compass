"""Persist initial and revised study plans without exposing an adapter to callers."""

from dataclasses import dataclass

from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.study_plans import (
    PlanRecordId,
    StoredStudyPlan,
    StudyPlanRepository,
)
from haui_compass.domain.plans.plan import StudyPlan
from haui_compass.domain.plans.replanning import ReplanningResult


@dataclass(frozen=True, slots=True, kw_only=True)
class PersistInitialStudyPlanRequest:
    record_id: PlanRecordId
    plan: StudyPlan


@dataclass(frozen=True, slots=True, kw_only=True)
class PersistReplannedStudyPlanRequest:
    record_id: PlanRecordId
    baseline_record_id: PlanRecordId
    result: ReplanningResult


class PersistInitialStudyPlan:
    def __init__(self, *, repository: StudyPlanRepository, clock: Clock) -> None:
        self._repository = repository
        self._clock = clock

    def execute(self, request: PersistInitialStudyPlanRequest) -> StoredStudyPlan:
        saved_at = self._clock.now()
        return self._repository.save_initial(
            record_id=request.record_id,
            plan=request.plan,
            saved_at=saved_at,
        )


class PersistReplannedStudyPlan:
    def __init__(self, *, repository: StudyPlanRepository, clock: Clock) -> None:
        self._repository = repository
        self._clock = clock

    def execute(self, request: PersistReplannedStudyPlanRequest) -> StoredStudyPlan:
        saved_at = self._clock.now()
        return self._repository.save_revision(
            record_id=request.record_id,
            baseline_record_id=request.baseline_record_id,
            result=request.result,
            saved_at=saved_at,
        )
