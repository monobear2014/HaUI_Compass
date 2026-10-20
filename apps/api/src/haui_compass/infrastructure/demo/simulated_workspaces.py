"""Per-account simulated Canvas-like workspaces for the staging demo.

Each authenticated account gets its own copy of the two-week fixture (rebuilt deterministically
from a stored anchor), its own student namespace and its own virtual clock. Nothing here is
global demo state: the active workspace is bound to the current request only.

This is fictional demo data, not an LMS integration. Deterministic planning, risk and replanning
are unchanged; they simply read this request's clock and LMS records.
"""

from collections.abc import Callable, Collection
from contextvars import ContextVar
from dataclasses import replace
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Literal
from uuid import UUID

from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSSubmissionRecord,
)
from haui_compass.application.ports.simulated_submissions import (
    SimulatedAssignmentCatalogEntry,
    SimulatedSubmission,
    SimulatedSubmissionRepository,
)
from haui_compass.application.ports.simulated_workspaces import (
    SimulatedWorkspace,
    SimulatedWorkspaceRepository,
)
from haui_compass.application.ports.tasks import StoredTask, TaskRepository
from haui_compass.application.ports.transactions import PersistenceTransactionManager
from haui_compass.infrastructure.demo.scenarios import (
    DEMO_DAY_START_HOUR,
    HANOI_OFFSET,
    Scenario,
    SteppingDemoClock,
    week_scenario,
)
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.persistence.memory.simulated_submissions import (
    InMemorySimulatedSubmissionRepository,
)

# The workspace of the account making the current request; never shared between requests.
ACTIVE_WORKSPACE: ContextVar[SimulatedWorkspace | None] = ContextVar(
    "haui_compass_active_simulated_workspace", default=None
)


def monday_anchor(instant: datetime) -> datetime:
    """Monday 09:00 (Hanoi) of the week containing ``instant``: the fixture's week start."""
    local = instant + HANOI_OFFSET
    start = local.replace(hour=DEMO_DAY_START_HOUR, minute=0, second=0, microsecond=0)
    return start - timedelta(days=local.weekday()) - HANOI_OFFSET


def scenario_for(workspace: SimulatedWorkspace) -> Scenario:
    return week_scenario(workspace.anchor, workspace.student)


class WorkspaceClock:
    """The active account's virtual time, else the real clock (e.g. outside a workspace)."""

    def __init__(self, fallback: Clock) -> None:
        self._fallback = fallback

    def now(self) -> datetime:
        workspace = ACTIVE_WORKSPACE.get()
        return workspace.now if workspace is not None else self._fallback.now()


class SimulatedCanvasLMSProvider:
    """Serves the fixture only to the active account's own current student namespace."""

    def _provider(self, student: ExternalRef) -> MockLMSProvider:
        workspace = ACTIVE_WORKSPACE.get()
        if workspace is None or workspace.student != student:
            raise LMSNotFoundError(LMSEntity.STUDENT, student)
        scenario = scenario_for(workspace)
        return MockLMSProvider({scenario.student: scenario.records})

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]:
        return self._provider(student).get_courses(student)

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]:
        return self._provider(student).get_assignments(student, courses=courses)

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]:
        return self._provider(student).get_submission_statuses(student, assignments=assignments)


class SimulatedWorkspaces:
    """Load, seed, reset and advance one account's workspace inside a single transaction."""

    def __init__(
        self,
        *,
        repository: SimulatedWorkspaceRepository,
        tasks: TaskRepository,
        transaction_manager: PersistenceTransactionManager,
        clock: Clock,
        submissions: SimulatedSubmissionRepository | None = None,
    ) -> None:
        self._repository = repository
        self._tasks = tasks
        self._tx = transaction_manager
        self._clock = clock  # real time: only used to date new fixtures and audit timestamps
        self._submissions = submissions or InMemorySimulatedSubmissionRepository()

    def submit(self, owner: str, assignment_id: UUID) -> SimulatedSubmission:
        def operation() -> SimulatedSubmission:
            space = self._repository.get(owner, for_update=True)
            if space is None or not any(
                assignment_id_for(a.ref) == assignment_id for a in scenario_for(space).records[1]
            ):
                raise LMSNotFoundError(
                    LMSEntity.ASSIGNMENT, ExternalRef("simulated", str(assignment_id))
                )
            return self._submissions.first(
                SimulatedSubmission(
                    student_id_for(space.student),
                    assignment_id,
                    space.now,
                )
            )

        return self._tx.run(operation)

    def assignment_catalog(
        self, space: SimulatedWorkspace
    ) -> tuple[SimulatedAssignmentCatalogEntry, ...]:
        scenario = scenario_for(space)
        courses = {course.ref: course.name for course in scenario.records[0]}
        return tuple(
            SimulatedAssignmentCatalogEntry(
                key=f"assignment-{index + 1}",
                assignment_id=assignment_id_for(assignment.ref),
                title=assignment.title,
                course=courses[assignment.course_ref],
            )
            for index, assignment in enumerate(scenario.records[1])
        )

    def submission_rows(
        self, space: SimulatedWorkspace
    ) -> tuple[
        tuple[tuple[datetime | None, datetime | None], ...],
        tuple[tuple[datetime | None, datetime | None], ...],
    ]:
        """Called inside the reporting transaction. Baseline is explicitly synthetic."""
        events = {
            row.assignment_id: row.submitted_at
            for row in self._submissions.list_for_student(student_id_for(space.student))
        }
        after = tuple(
            (a.deadline, events.get(assignment_id_for(a.ref)))
            for a in scenario_for(space).records[1]
        )
        due = space.anchor - timedelta(days=3)
        before = (
            (
                due,
                due - timedelta(hours=1)
                if sha256(space.owner.encode()).digest()[0] % 2
                else due + timedelta(hours=1),
            ),
        )
        return before, after

    def submissions_for(self, owner: str) -> tuple[SimulatedSubmission, ...]:
        def operation() -> tuple[SimulatedSubmission, ...]:
            space = self._repository.get(owner)
            return (
                ()
                if space is None
                else self._submissions.list_for_student(student_id_for(space.student))
            )

        return self._tx.run(operation)

    def get(self, owner: str) -> SimulatedWorkspace | None:
        return self._tx.run(lambda: self._repository.get(owner))

    def ensure(self, owner: str) -> SimulatedWorkspace:
        """Return the account's workspace, seeding a fresh fixture on first use."""
        existing = self.get(owner)
        if existing is not None:
            return existing
        try:
            return self._tx.run(lambda: self._seed(owner, generation=1, existing=None))
        except Exception:
            # A concurrent first request may have seeded the same account; use its result.
            winner = self.get(owner)
            if winner is None:
                raise
            return winner

    def reset(self, owner: str) -> SimulatedWorkspace:
        """Start a new fixture generation; earlier generations' rows are never modified."""

        def operation() -> SimulatedWorkspace:
            current = self._repository.get(owner, for_update=True)
            generation = 1 if current is None else current.generation + 1
            return self._seed(owner, generation=generation, existing=current)

        return self._tx.run(operation)

    def advance(self, owner: str, to: Literal["next_day", "next_week"]) -> SimulatedWorkspace:
        def operation() -> SimulatedWorkspace:
            current = self._repository.get(owner, for_update=True)
            if current is None:
                raise LMSNotFoundError(LMSEntity.STUDENT, ExternalRef("simulated", owner))
            stepping = SteppingDemoClock(current.now)
            if to == "next_day":
                stepping.advance_to_next_day()
            else:
                stepping.advance_to_next_week()
            return self._repository.save(
                replace(current, now=stepping.now(), updated_at=self._clock.now())
            )

        return self._tx.run(operation)

    def _seed(
        self, owner: str, *, generation: int, existing: SimulatedWorkspace | None
    ) -> SimulatedWorkspace:
        real_now = self._clock.now()
        anchor = monday_anchor(real_now)
        workspace = SimulatedWorkspace(
            owner=owner,
            generation=generation,
            anchor=anchor,
            now=anchor,
            created_at=existing.created_at if existing is not None else real_now,
            updated_at=real_now,
        )
        write: Callable[[SimulatedWorkspace], SimulatedWorkspace] = (
            self._repository.add if existing is None else self._repository.save
        )
        write(workspace)
        scenario = scenario_for(workspace)
        for task in scenario.tasks:
            self._tasks.save(
                StoredTask(student_id=student_id_for(scenario.student), task=task, saved_at=anchor)
            )
        return workspace
