from datetime import timedelta
from typing import Literal
from uuid import UUID

from pydantic import Field

from haui_compass.api.schemas.common import ApiModel, ExternalRefDTO


class CreateStudyTaskRequestDTO(ApiModel):
    student: ExternalRefDTO
    assignment: ExternalRefDTO
    task_id: UUID
    title: str = Field(min_length=1, max_length=500)
    estimated_effort_minutes: int = Field(gt=0, le=10_080)

    def duration(self) -> timedelta:
        return timedelta(minutes=self.estimated_effort_minutes)


class StudyTaskResponse(ApiModel):
    kind: Literal["study_task"] = "study_task"
    id: UUID
    assignment_id: UUID
    title: str
    estimated_duration_seconds: int
    status: Literal["not_started", "in_progress", "completed"]
