"""Service-authenticated, server-provisioned lecturer access to aggregate demo data."""

import json
import os
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from haui_compass.api.lecturer_fixture import (
    AS_OF,
    CLASSES,
    SOURCE,
    obligations,
)
from haui_compass.domain.lecturer import submission_progress

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
    }


@router.get("/classes")
def classes(grants: tuple[str, ...] = Depends(authorized_classes)) -> dict[str, object]:
    return {
        "source": SOURCE,
        "simulated": True,
        "as_of": AS_OF,
        "minimum_cohort": MIN_COHORT,
        "classes": [class_progress(cid) for cid in grants if cid in CLASSES],
    }


@router.get("/classes/{class_id}/progress")
def progress(
    class_id: str, grants: tuple[str, ...] = Depends(authorized_classes)
) -> dict[str, object]:
    if class_id not in grants or class_id not in CLASSES:
        raise HTTPException(404, "Class not found")
    return {"source": SOURCE, "simulated": True, "as_of": AS_OF, **class_progress(class_id)}
