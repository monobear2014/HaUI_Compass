"""Service-authenticated, server-provisioned lecturer access to aggregate demo data."""

import json
import os
import secrets
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from haui_compass.api.lecturer_fixture import (
    AS_OF,
    CLASSES,
    SOURCE,
    baseline_obligations,
    obligations,
)
from haui_compass.application.ports.simulated_workspaces import OWNER_PATTERN
from haui_compass.domain.lecturer import submission_comparison, submission_progress

router = APIRouter(prefix="/lecturer", tags=["lecturer"])
MIN_COHORT = 5


def lecturer_classes(user: str) -> tuple[str, ...] | None:
    # Account IDs, never usernames or browser role claims. Invalid config fails closed.
    try:
        grants = json.loads(os.getenv("COMPASS_LECTURER_GRANTS", "{}"))
        value = grants.get(user) if isinstance(grants, dict) else None
        if isinstance(value, list) and all(isinstance(x, str) for x in value):
            return tuple(value)
    except (ValueError, TypeError):
        pass
    return None


def authorized_classes(request: Request, response: Response) -> tuple[str, ...]:
    response.headers["Cache-Control"] = "no-store"
    expected = os.getenv("COMPASS_SERVICE_KEY", "")
    actual = request.headers.get("X-Compass-Service-Key", "")
    if not expected or not secrets.compare_digest(expected.encode(), actual.encode()):
        raise HTTPException(403, "Forbidden")
    user = request.headers.get("X-Compass-User", "")
    if not user:
        raise HTTPException(401, "Authentication required")
    grants = lecturer_classes(user)
    if grants is None:
        raise HTTPException(403, "Lecturer role required")
    return grants


def class_progress(class_id: str) -> dict[str, object]:
    title, size = CLASSES[class_id]
    # Suppress the entire cohort, not individual cells (which leak via subtraction).
    return {
        "class_id": class_id,
        "title": title,
        "suppressed": size < MIN_COHORT,
        "enrollment_count": size if size >= MIN_COHORT else None,
        "progress": submission_progress(obligations(size), as_of=AS_OF)
        if size >= MIN_COHORT
        else None,
        "comparison": {
            "simulated": True,
            "before_label": "Trước sử dụng · mô phỏng",
            "after_label": "Sau sử dụng · mô phỏng",
            **submission_comparison(baseline_obligations(size), obligations(size), as_of=AS_OF),
        }
        if size >= MIN_COHORT
        else None,
    }


def class_owners(class_id: str) -> list[str]:
    owners: list[str] = []
    try:
        rosters = json.loads(os.getenv("COMPASS_SIMULATED_CLASS_ROSTERS", "{}"))
        value = rosters.get(class_id, []) if isinstance(rosters, dict) else []
        if (
            isinstance(value, list)
            and len(value) <= 1000
            and all(isinstance(owner, str) and OWNER_PATTERN.fullmatch(owner) for owner in value)
        ):
            owners = list(dict.fromkeys(value))
    except (ValueError, TypeError):
        pass
    # A teacher cannot count as an enrolled learner. Browser-supplied rosters are ignored.
    return [owner for owner in owners if lecturer_classes(owner) is None]


def live_class_progress(request: Request, class_id: str) -> dict[str, object]:
    owners = class_owners(class_id)
    reader = getattr(request.app.state, "lecturer_activity", None)
    size, activity, progress, comparison = reader(owners) if reader else (0, None, None, None)
    suppressed = size < MIN_COHORT
    return {
        "class_id": class_id,
        "title": CLASSES[class_id][0],
        "suppressed": suppressed,
        "enrollment_count": None if suppressed else size,
        "activity": None if suppressed else activity,
        "progress": None if suppressed else progress,
        "comparison": None if suppressed else comparison,
    }


def report_class(request: Request, class_id: str) -> dict[str, object]:
    # Explicit legacy fixture mode is for isolated tests/presentations only.
    if os.getenv("COMPASS_LECTURER_FIXTURE") == "1":
        return class_progress(class_id)
    return live_class_progress(request, class_id)


def report_metadata() -> dict[str, object]:
    fixture = os.getenv("COMPASS_LECTURER_FIXTURE") == "1"
    return {
        "source": SOURCE if fixture else "Live simulated-account activity",
        "simulated": True,
        "as_of": AS_OF if fixture else datetime.now(UTC),
        "mode": "fixture" if fixture else "live_activity",
    }


@router.get("/classes")
def classes(
    request: Request, grants: tuple[str, ...] = Depends(authorized_classes)
) -> dict[str, object]:
    return {
        **report_metadata(),
        "minimum_cohort": MIN_COHORT,
        "classes": [report_class(request, cid) for cid in grants if cid in CLASSES],
    }


@router.get("/classes/{class_id}/progress")
def progress(
    request: Request, class_id: str, grants: tuple[str, ...] = Depends(authorized_classes)
) -> dict[str, object]:
    if class_id not in grants or class_id not in CLASSES:
        raise HTTPException(404, "Class not found")
    return {**report_metadata(), **report_class(request, class_id)}


@router.get("/classes/{class_id}/insights")
def insights(
    request: Request, class_id: str, grants: tuple[str, ...] = Depends(authorized_classes)
) -> dict[str, object]:
    if class_id not in grants or class_id not in CLASSES:
        raise HTTPException(404, "Class not found")
    reader = getattr(request.app.state, "lecturer_insights", None)
    detail = (
        reader(class_owners(class_id), MIN_COHORT)
        if reader and os.getenv("COMPASS_LECTURER_FIXTURE") != "1"
        else None
    )
    return {
        **report_metadata(),
        "class_id": class_id,
        "minimum_cohort": MIN_COHORT,
        "suppressed": detail is None,
        "detail": detail,
    }
