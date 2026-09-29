"""Opt-in fictional frontend demo. Run from apps/api; default API remains unseeded."""

from datetime import UTC, datetime, timedelta, timezone
from uuid import UUID

from fastapi import FastAPI
from pydantic import BaseModel

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.study_plans import PlanRecordId
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.persisted_learning_loop import (
    GeneratePersistedWeeklyPlanRequest,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.tasks.task import Task, TaskId

HANOI = timezone(timedelta(hours=7))


class DemoTaskDTO(BaseModel):
    id: UUID
    title: str
    assignment_id: UUID
    assignment_title: str
    course: str
    deadline: datetime
    estimated_duration_seconds: int
    status: str


class DemoContextDTO(BaseModel):
    mode: str = "fictional_in_memory_demo"
    student: dict[str, str]
    period: dict[str, datetime]
    study_windows: list[dict[str, datetime]]
    now: datetime
    tasks: list[DemoTaskDTO]


def create_demo_app(clock: Clock | None = None) -> FastAPI:
    container = build_container(clock=clock)
    resolved_clock = container.clock
    anchor = resolved_clock.now()
    student = ExternalRef("mock-lms", "student-001")
    lms = container.lms
    assignments = {item.ref.id: item for item in lms.get_assignments(student)}
    courses = {item.ref: item.name for item in lms.get_courses(student)}
    definitions = (
        (101, "db-c", "Draft the relational schema", 45),
        (102, "ml-a", "Implement the regression baseline", 60),
        (103, "ml-b", "Compare model evaluation metrics", 90),
        (104, "en-d", "Outline the presentation", 30),
    )
    metadata = {}
    for identifier, key, title, minutes in definitions:
        assignment = assignments[key]
        task = Task(
            id=TaskId(UUID(int=identifier)),
            assignment_id=assignment_id_for(assignment.ref),
            title=title,
            estimated_duration=timedelta(minutes=minutes),
        )
        container.task_repository.save(
            StoredTask(student_id=student_id_for(student), task=task, saved_at=anchor)
        )
        metadata[task.id] = assignment
    local_midnight = anchor.astimezone(HANOI).replace(hour=0, minute=0, second=0, microsecond=0)
    period = PlanPeriod(start=local_midnight, end=local_midnight + timedelta(days=7))
    # These are authored fictional availability windows, not inferred capacity.
    windows = tuple(
        StudyWindow(
            starts_at=anchor + timedelta(hours=offset),
            ends_at=anchor + timedelta(hours=offset, minutes=length),
        )
        for offset, length in ((1, 90), (25, 60), (49, 60))
    )
    container.generate_persisted_weekly_plan.execute(
        GeneratePersistedWeeklyPlanRequest(
            student=student,
            period=period,
            study_windows=windows,
            record_id=PlanRecordId(UUID(int=201)),
        )
    )
    app = create_app(container)

    @app.get("/api/v1/demo/context", response_model=DemoContextDTO)
    def demo_context() -> DemoContextDTO:
        rows = []
        for record in container.task_repository.list_for_student(student_id_for(student)):
            task = record.task
            assignment = metadata[task.id]
            assert assignment.deadline is not None
            rows.append(
                DemoTaskDTO(
                    id=task.id,
                    title=task.title,
                    assignment_id=task.assignment_id,
                    assignment_title=assignment.title,
                    course=courses[assignment.course_ref],
                    deadline=assignment.deadline,
                    estimated_duration_seconds=int(task.estimated_duration.total_seconds()),
                    status=task.status.value,
                )
            )
        return DemoContextDTO(
            student={"provider": student.provider, "id": student.id},
            period={"start": period.start, "end": period.end},
            study_windows=[
                {"starts_at": item.starts_at, "ends_at": item.ends_at} for item in windows
            ],
            now=resolved_clock.now().astimezone(UTC),
            tasks=rows,
        )

    return app


app = create_demo_app()
