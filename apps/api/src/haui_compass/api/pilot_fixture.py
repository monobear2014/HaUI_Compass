"""Development-only, resettable fixture for Controlled Thesis Pilot Protocol v1.3."""

from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

from fastapi import FastAPI

from haui_compass.api.dependencies import AppContainer, build_container
from haui_compass.api.main import create_app
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSSubmissionRecord,
    SubmissionStatus,
)
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus


class PilotLMS:
    def get_courses(self, student):
        return COURSES

    def get_assignments(self, student, *, courses=None):
        return ASSIGNMENTS

    def get_submission_statuses(self, student, *, assignments=None):
        return SUBMISSIONS


HANOI = timezone(timedelta(hours=7))
NOW = datetime(2026, 10, 5, 2, tzinfo=UTC)
STUDENT = ExternalRef("pilot-fixture", "canonical-v1-3")


def r(x: str) -> ExternalRef:
    return ExternalRef("pilot-fixture", x)


def d(day: int, hour: int) -> datetime:
    return datetime(2026, 10, day, hour, tzinfo=HANOI).astimezone(UTC)


class Clock:
    def now(self) -> datetime:
        return NOW


COURSES = tuple(
    LMSCourseRecord(ref=r(i), name=n, code=c)
    for i, n, c in (
        ("algorithms", "Algorithms", "PILOT-ALG"),
        ("databases", "Databases", "PILOT-DB"),
        ("machine-learning", "Machine Learning", "PILOT-ML"),
        ("academic-skills", "Academic Skills", "PILOT-AS"),
    )
)
ASSIGNMENTS = tuple(
    LMSAssignmentRecord(
        ref=r(i),
        course_ref=r(c),
        title=t,
        deadline=d(day, h),
        estimated_effort=timedelta(minutes=m),
    )
    for i, c, t, day, h, m in (
        ("problem-set-3", "algorithms", "Problem Set 3", 7, 17, 120),
        ("er-model-report", "databases", "ER-model report", 8, 12, 90),
        ("quiz-revision", "machine-learning", "Quiz revision", 6, 17, 60),
        ("mini-project-outline", "machine-learning", "Mini-project outline", 9, 17, 90),
        ("reading-response", "academic-skills", "Reading response", 8, 17, 45),
    )
)
SUBMISSIONS = tuple(
    LMSSubmissionRecord(assignment_ref=a.ref, status=SubmissionStatus.NOT_SUBMITTED)
    for a in ASSIGNMENTS
)
WINDOWS = tuple(
    (d(day, s), d(day, e)) for day, s, e in ((5, 18, 19), (6, 18, 19), (7, 18, 20), (8, 18, 19))
)


def build() -> AppContainer:
    lms = PilotLMS()
    c = build_container(lms=lms, clock=Clock())
    by = {a.ref.id: a for a in ASSIGNMENTS}
    for n, k, t, m, s in (
        (1, "problem-set-3", "Solve graph exercises", 120, TaskStatus.NOT_STARTED),
        (2, "er-model-report", "Draft ER diagram", 90, TaskStatus.NOT_STARTED),
        (3, "quiz-revision", "Review regularisation notes", 60, TaskStatus.IN_PROGRESS),
        (4, "mini-project-outline", "Write project outline", 90, TaskStatus.NOT_STARTED),
    ):
        a = by[k]
        c.task_repository.save(
            StoredTask(
                student_id=student_id_for(STUDENT),
                task=Task(
                    id=TaskId(UUID(int=n)),
                    assignment_id=assignment_id_for(a.ref),
                    title=t,
                    estimated_duration=timedelta(minutes=m),
                    status=s,
                ),
                saved_at=NOW,
            )
        )
    return c


def snapshot(c: AppContainer) -> dict:
    ts = c.task_repository.list_for_student(student_id_for(STUDENT))
    return {
        "courses": 4,
        "assignments": 5,
        "student": {"provider": STUDENT.provider, "id": STUDENT.id},
        "period": {"start": d(5, 0), "end": d(10, 0)},
        "study_windows": [{"starts_at": x, "ends_at": y} for x, y in WINDOWS],
        "tasks": [
            {
                "id": str(x.task.id),
                "title": x.task.title,
                "assignment_id": str(x.task.assignment_id),
                "estimated_duration_seconds": int(x.task.estimated_duration.total_seconds()),
                "status": x.task.status.value,
            }
            for x in ts
        ],
    }


def create_pilot_fixture_app() -> FastAPI:
    app = create_app(build())

    @app.post("/api/v1/pilot-fixture/reset")
    def reset() -> dict:
        app.state.container = build()
        return snapshot(app.state.container)

    @app.get("/api/v1/demo/context")
    def context() -> dict:
        return snapshot(app.state.container)

    return app


app = create_pilot_fixture_app()
