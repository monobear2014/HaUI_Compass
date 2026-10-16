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
from typing import Literal

from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSEntity,
    LMSNotFoundError,
    LMSSubmissionRecord,
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
    ) -> None:
        self._repository = repository
        self._tasks = tasks
        self._tx = transaction_manager
        self._clock = clock  # real time: only used to date new fixtures and audit timestamps

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
