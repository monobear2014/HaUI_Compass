from datetime import UTC, datetime, timedelta
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.use_cases.daily_recommendation import AssignmentCapacity
from haui_compass.domain.assignments.assignment import AssignmentId


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ExternalRefDTO(ApiModel):
    provider: str = Field(min_length=1)
    id: str = Field(min_length=1)

    def to_domain(self) -> ExternalRef:
        return ExternalRef(provider=self.provider, id=self.id)


def require_aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must include a timezone")
    return value.astimezone(UTC)


class AssignmentCapacityDTO(ApiModel):
    assignment_id: UUID
    available_minutes: int = Field(ge=0)

    def to_domain(self) -> AssignmentCapacity:
        return AssignmentCapacity(
            assignment_id=AssignmentId(self.assignment_id),
            available_until_deadline=timedelta(minutes=self.available_minutes),
        )


class AwareIntervalDTO(ApiModel):
    started_at: datetime
    ended_at: datetime

    _started_aware = field_validator("started_at")(require_aware)
    _ended_aware = field_validator("ended_at")(require_aware)
