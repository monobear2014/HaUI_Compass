"""Daily organization metadata; task completion remains an execution fact."""

from datetime import datetime, time, timedelta
from typing import Annotated, Literal
from uuid import UUID
from zoneinfo import ZoneInfo

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field, model_validator

from haui_compass.api.demo_context import DemoContextDTO, snapshot
from haui_compass.api.dependencies import AppContainer
from haui_compass.api.learning_preferences import student_owner
from haui_compass.api.schemas.common import ApiModel
from haui_compass.api.v1.routes import academic_data_context, container_dependency
from haui_compass.application.academic_import import AcademicSource
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.use_cases.create_study_task import CreateStudyTaskRequest
from haui_compass.domain.tasks.task import TaskId

router = APIRouter(prefix="/ticket-board", tags=["ticket-board"])


class BoardDTO(ApiModel):
    scope: str = Field(min_length=1, max_length=256)
    version: int = Field(ge=0)
    task_ids: list[UUID]
    ticket_order: list[UUID] = Field(default_factory=list)
    active_task_id: UUID | None = None
    planned_minutes: dict[UUID, Annotated[int, Field(ge=5, le=480)]] = Field(default_factory=dict)
    columns: dict[UUID, Literal["todo", "progress", "review", "done"]] = Field(default_factory=dict)
    capacity_minutes: int = Field(ge=0, le=1440)

    @model_validator(mode="after")
    def unique_tasks(self) -> "BoardDTO":
        if len(set(self.ticket_order)) != len(self.ticket_order):
            raise ValueError("Duplicate ticket order")
        if len(set(self.task_ids)) != len(self.task_ids):
            raise ValueError("Duplicate tickets")
        if self.active_task_id and self.active_task_id not in self.task_ids:
            raise ValueError("Focus ticket must be in today's list")
        if not set(self.planned_minutes).issubset(self.task_ids):
            raise ValueError("Only selected tickets may have daily estimates")
        return self


def workspace(
    request: Request, owner: str, container: AppContainer
) -> tuple[DemoContextDTO, str, str]:
    factory = getattr(request.app.state, "companion_context", None)
    if request.query_params.get("source"):
        try:
            source = AcademicSource(request.query_params["source"])
        except ValueError:
            raise HTTPException(422, "Unknown academic source") from None
        student = request.query_params.get("student_external_id")
        if student != owner:
            raise HTTPException(403, "Student context belongs to another account")
        value = academic_data_context(source, student, container)
        context = DemoContextDTO.model_validate(
            {
                "scenario_id": "imported",
                "scenario_label": "Imported LMS",
                "generation": 0,
                "available_minutes": 0,
                "assignment_capacities": [],
                **value,
            }
        )
    elif factory:
        context = factory(owner)
    elif getattr(request.app.state, "demo", None):
        context = snapshot(request.app.state.demo)
    else:
        raise HTTPException(503, "Learning workspace unavailable")
    day = context.now.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat()
    ref = context.student
    scope = f"{ref['provider']}:{ref['id']}:{context.generation}:{day}"
    return context, scope, day


def detail_scope(scope: str) -> str:
    return scope.rsplit(":", 1)[0] + ":details"


class TicketDetailsDTO(ApiModel):
    scope: str = Field(min_length=1, max_length=256)
    version: int = Field(ge=0)
    task_id: UUID
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(max_length=2000)


class CreateTicketDTO(ApiModel):
    scope: str = Field(min_length=1, max_length=256)
    task_id: UUID
    assignment_id: UUID
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=2000)
    estimated_minutes: int = Field(ge=5, le=480)


@router.post("/tasks")
def create_ticket(
    request: Request, body: CreateTicketDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)

    def create() -> dict[str, object]:
        context, scope, day = workspace(request, owner, container)
        if body.scope != detail_scope(scope):
            raise HTTPException(409, "The workspace changed; reload before creating")
        assignment = next(
            (a for a in context.assignments if a.assignment_id == body.assignment_id), None
        )
        if assignment is None:
            raise HTTPException(404, "Assignment not found in your workspace")
        title = body.title.strip()
        if len(title) < 2:
            raise HTTPException(422, "Ticket title is too short")
        student = ExternalRef(context.student["provider"], context.student["id"])
        old = container.task_repository.get(student_id_for(student), TaskId(body.task_id))
        if old:
            if (
                old.task.title != title
                or old.task.assignment_id != body.assignment_id
                or old.task.estimated_duration != timedelta(minutes=body.estimated_minutes)
            ):
                raise HTTPException(409, "Ticket identifier already used")
            return envelope(context, scope, day, container, owner)
        container.create_study_task.execute(
            CreateStudyTaskRequest(
                student=student,
                assignment=ExternalRef(assignment.provider, assignment.external_id),
                task_id=TaskId(body.task_id),
                title=title,
                estimated_duration=timedelta(minutes=body.estimated_minutes),
            )
        )
        key = detail_scope(scope)
        details = container.ticket_boards.get(owner, key) or {"version": 0, "edits": {}}
        edits = dict(details["edits"])
        edits[str(body.task_id)] = {"title": title, "description": body.description.strip()}
        version = details["version"]
        if not container.ticket_boards.save(
            owner, key, {"version": version + 1, "edits": edits}, version
        ):
            raise HTTPException(409, "Ticket details changed; retry creating")
        return envelope(context, scope, day, container, owner)

    return container.transaction_manager.run(create)


@router.post("/details")
def save_details(
    request: Request, body: TicketDetailsDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)

    def save() -> dict[str, object]:
        context, scope, day = workspace(request, owner, container)
        if str(body.task_id) not in {str(t.id) for t in context.tasks}:
            raise HTTPException(404, "Ticket not found in your workspace")
        title = body.title.strip()
        if len(title) < 2:
            raise HTTPException(422, "Ticket title is too short")
        key = detail_scope(scope)
        if body.scope != key:
            raise HTTPException(409, "The workspace changed; reload before editing")
        old = container.ticket_boards.get(owner, key) or {"version": 0, "edits": {}}
        edits = dict(old["edits"])
        edits[str(body.task_id)] = {"title": title, "description": body.description.strip()}
        value = {"version": body.version + 1, "edits": edits}
        if not container.ticket_boards.save(owner, key, value, body.version):
            raise HTTPException(409, "Ticket details changed; reload before editing")
        return envelope(context, scope, day, container, owner)

    return container.transaction_manager.run(save)


def envelope(
    context: DemoContextDTO, scope: str, day: str, container: AppContainer, owner: str
) -> dict[str, object]:
    start = datetime.combine(
        context.now.astimezone(ZoneInfo("Asia/Ho_Chi_Minh")).date(),
        time.min,
        tzinfo=ZoneInfo("Asia/Ho_Chi_Minh"),
    )
    end = start + timedelta(days=1)
    student = student_id_for(ExternalRef(context.student["provider"], context.student["id"]))
    actual = {}
    for task in context.tasks:
        seconds = sum(
            max(
                0,
                (
                    min(row.execution.ended_at, end) - max(row.execution.started_at, start)
                ).total_seconds(),
            )
            for row in container.execution_repository.list_for_task(student, TaskId(task.id))
        )
        if seconds:
            actual[str(task.id)] = round(seconds / 60, 1)
    return {
        "scope": scope,
        "day": day,
        "board": container.ticket_boards.get(owner, scope),
        "actual_minutes": actual,
        "details_scope": detail_scope(scope),
        "details": container.ticket_boards.get(owner, detail_scope(scope))
        or {"version": 0, "edits": {}},
    }


@router.get("")
def read_board(
    request: Request, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)

    def read() -> dict[str, object]:
        context, scope, day = workspace(request, owner, container)
        return envelope(context, scope, day, container, owner)

    return container.transaction_manager.run(read)


@router.post("")
def save_board(
    request: Request, body: BoardDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)

    def save() -> dict[str, object]:
        context, scope, day = workspace(request, owner, container)
        if body.scope != scope:
            raise HTTPException(409, "The learning day changed; reload the board")
        tasks = {str(t.id): t for t in context.tasks}
        if any(
            str(identifier) not in tasks
            for identifier in [*body.task_ids, *body.columns, *body.ticket_order]
        ):
            raise HTTPException(404, "Ticket not found in your workspace")
        if body.active_task_id and tasks[str(body.active_task_id)].status == "completed":
            raise HTTPException(409, "Completed tickets cannot be focused")
        value = body.model_dump(mode="json", exclude={"scope"})
        value["version"] = body.version + 1
        if not container.ticket_boards.save(owner, scope, value, body.version):
            raise HTTPException(409, "The board changed in another tab; reload before editing")
        return envelope(context, scope, day, container, owner)

    return container.transaction_manager.run(save)
