"""Append-only revision contract for study plans and typed replanning audits."""

from dataclasses import dataclass
from datetime import datetime
from typing import NewType, Protocol
from uuid import UUID

from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan
from haui_compass.domain.plans.replanning import ReplanningResult
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc
from haui_compass.domain.students.ids import StudentId

PlanRecordId = NewType("PlanRecordId", UUID)


@dataclass(frozen=True, slots=True, kw_only=True)
class StoredStudyPlan:
    record_id: PlanRecordId
    plan: StudyPlan
    revision: int
    parent_record_id: PlanRecordId | None
    saved_at: datetime
    replanning_result: ReplanningResult | None

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "saved_at",
            require_aware_utc(self.saved_at, "StoredStudyPlan.saved_at"),
        )
        if self.revision < 1:
            raise DomainValidationError("StoredStudyPlan.revision must be at least 1")
        if self.saved_at < self.plan.generated_at:
            raise DomainValidationError("StoredStudyPlan.saved_at must not precede plan generation")
        if self.revision == 1:
            if self.parent_record_id is not None or self.replanning_result is not None:
                raise DomainValidationError(
                    "initial StoredStudyPlan must not have a parent or replanning result"
                )
        elif self.parent_record_id is None or self.replanning_result is None:
            raise DomainValidationError(
                "revised StoredStudyPlan requires a parent and replanning result"
            )
        if self.replanning_result is not None and self.replanning_result.revised_plan != self.plan:
            raise DomainValidationError(
                "StoredStudyPlan plan must equal its replanning result's revised plan"
            )


class StudyPlanRepository(Protocol):
    def save_initial(
        self, *, record_id: PlanRecordId, plan: StudyPlan, saved_at: datetime
    ) -> StoredStudyPlan: ...

    def save_revision(
        self,
        *,
        record_id: PlanRecordId,
        baseline_record_id: PlanRecordId,
        result: ReplanningResult,
        saved_at: datetime,
    ) -> StoredStudyPlan:
        """Append against the expected latest baseline or raise a stale-revision error."""
        ...

    def get(self, record_id: PlanRecordId) -> StoredStudyPlan | None: ...

    def latest(self, student_id: StudentId, period: PlanPeriod) -> StoredStudyPlan | None: ...

    def history(self, student_id: StudentId, period: PlanPeriod) -> tuple[StoredStudyPlan, ...]: ...
