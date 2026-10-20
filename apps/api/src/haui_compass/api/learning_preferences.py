"""Account-owned preferences: explicit save, editable draft and physical deletion."""

import os
import secrets
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from typing import Literal
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, model_validator

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.lecturer import lecturer_classes
from haui_compass.api.schemas.common import ApiModel
from haui_compass.api.schemas.learning_loop import PlanPeriodDTO
from haui_compass.api.v1.routes import container_dependency
from haui_compass.application.ports.simulated_workspaces import OWNER_PATTERN

router = APIRouter(prefix="/learning-preferences", tags=["learning-preferences"])


class PreferredSession(ApiModel):
    weekday: int = Field(ge=1, le=7)
    start_minute: int = Field(ge=0, le=1439)
    duration_minutes: int = Field(ge=15, le=180)

    @model_validator(mode="after")
    def within_day(self) -> "PreferredSession":
        if self.start_minute + self.duration_minutes > 1440:
            raise ValueError("Session must end in the same day")
        return self


class LearningPreferencesDTO(ApiModel):
    timezone: Literal["Asia/Ho_Chi_Minh"] = "Asia/Ho_Chi_Minh"
    weekly_target_minutes: int = Field(ge=15, le=2520)
    sessions: list[PreferredSession] = Field(min_length=1, max_length=14)
    difficult_topics: list[str] = Field(default_factory=list, max_length=5)

    @model_validator(mode="after")
    def validate_sessions(self) -> "LearningPreferencesDTO":
        topics = [t.strip() for t in self.difficult_topics]
        if any(not t or len(t) > 120 for t in topics):
            raise ValueError("Topics must contain 1-120 characters")
        self.difficult_topics = list(dict.fromkeys(topics))
        sessions = sorted(self.sessions, key=lambda s: (s.weekday, s.start_minute))
        for first, second in pairwise(sessions):
            if (
                first.weekday == second.weekday
                and first.start_minute + first.duration_minutes > second.start_minute
            ):
                raise ValueError("Preferred sessions overlap")
        return self


def student_owner(request: Request) -> str:
    expected = os.getenv("COMPASS_SERVICE_KEY", "")
    actual = request.headers.get("X-Compass-Service-Key", "")
    if not expected or not secrets.compare_digest(expected.encode(), actual.encode()):
        raise HTTPException(403, "Forbidden")
    owner = request.headers.get("X-Compass-User", "")
    if not OWNER_PATTERN.fullmatch(owner):
        raise HTTPException(401, "Authentication required")
    if lecturer_classes(owner) is not None:
        raise HTTPException(403, "Student role required")
    return owner


@router.get("")
def read_preferences(
    request: Request, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)
    value = container.transaction_manager.run(lambda: container.learning_preferences.get(owner))
    return {"preferences": value}


@router.put("")
@router.post("")
def save_preferences(
    request: Request, body: LearningPreferencesDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)
    value = body.model_dump(mode="json")
    value["confirmed_at"] = datetime.now(UTC).isoformat()
    container.transaction_manager.run(lambda: container.learning_preferences.save(owner, value))
    return {"preferences": value}


@router.delete("")
def delete_preferences(
    request: Request, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)
    container.transaction_manager.run(lambda: container.learning_preferences.delete(owner))
    return {"preferences": None}


@router.post("/preview")
def preview_preferences(
    request: Request, body: PlanPeriodDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)
    period = body.to_domain()
    if period.end - period.start > timedelta(days=8):
        raise HTTPException(422, "Preview must be at most eight days")
    value = container.transaction_manager.run(lambda: container.learning_preferences.get(owner))
    if value is None:
        return {"preferences": None, "study_windows": []}
    profile = LearningPreferencesDTO.model_validate(
        {k: v for k, v in value.items() if k != "confirmed_at"}
    )
    zone = ZoneInfo(profile.timezone)
    day = period.start.astimezone(zone).date()
    windows = []
    while day <= period.end.astimezone(zone).date():
        for session in profile.sessions:
            if day.isoweekday() != session.weekday:
                continue
            start = datetime.combine(day, datetime.min.time(), tzinfo=zone) + timedelta(
                minutes=session.start_minute
            )
            end = start + timedelta(minutes=session.duration_minutes)
            if start >= max(period.start, container.clock.now()) and end <= period.end:
                windows.append(
                    {
                        "starts_at": start.astimezone(UTC).isoformat(),
                        "ends_at": end.astimezone(UTC).isoformat(),
                    }
                )
        day += timedelta(days=1)
    return {"preferences": value, "study_windows": sorted(windows, key=lambda w: w["starts_at"])}
