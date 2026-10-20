"""Student-facing public courseware catalog, using the authenticated learning proxy."""

from fastapi import APIRouter, HTTPException, Query

from haui_compass.api.dependencies import AppContainer
from haui_compass.api.v1.routes import container_dependency

router = APIRouter(prefix="/knowledge", tags=["courseware"])


@router.get("/courses")
def courses(container: AppContainer = container_dependency) -> dict[str, object]:
    return {"courses": container.public_courseware.courses()}


@router.get("/courses/{course_id}/materials")
def course_materials(
    course_id: str, container: AppContainer = container_dependency
) -> dict[str, object]:
    try:
        return {
            "course_id": course_id,
            "materials": container.public_courseware.materials(course_id),
        }
    except FileNotFoundError:
        raise HTTPException(404, "Course not found") from None


@router.get("/courses/{course_id}/materials/{slug}")
def material(
    course_id: str,
    slug: str,
    page: int = Query(default=1, ge=1, le=200),
    container: AppContainer = container_dependency,
) -> dict[str, object]:
    try:
        return container.public_courseware.read(course_id, slug, page)
    except FileNotFoundError:
        raise HTTPException(404, "Material or page not found") from None
    except ValueError:
        raise HTTPException(503, "Public source verification failed") from None
