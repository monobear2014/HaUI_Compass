from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from haui_compass.api.schemas.common import ApiModel, AwareIntervalDTO, ExternalRefDTO


class TaskExecutionRequest(AwareIntervalDTO):
    student: ExternalRefDTO
    task_id: UUID
    record_id: UUID
    outcome: Literal["partial", "completed"]


class TaskExecutionResponse(ApiModel):
    kind: Literal["task_execution"] = "task_execution"
    record_id: UUID
    task_id: UUID
    student_id: UUID
    started_at: datetime
    ended_at: datetime
    actual_duration_seconds: float = Field(ge=0)
    outcome: str
    task_status: str
    idempotent_retry: bool
