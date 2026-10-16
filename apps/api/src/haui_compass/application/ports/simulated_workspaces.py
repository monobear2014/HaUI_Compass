"""Per-account simulated workspace: which fictional fixture an account holds and its own clock.

A workspace is demo/staging infrastructure state, not a learning fact. It records only what is
needed to rebuild the account's fictional Canvas-like fixture deterministically (``anchor``) and
the account's virtual clock (``now``). Tasks, plans, executions, goals and reflections stay in
their existing repositories, owned by ``student``.
"""

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from haui_compass.application.ports.lms import ExternalRef
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc

# Every generation is a separate student namespace, so a reset never touches earlier rows.
SIMULATED_PROVIDER_PREFIX = "simulated-canvas-g"
OWNER_PATTERN = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


@dataclass(frozen=True, slots=True, kw_only=True)
class SimulatedWorkspace:
    owner: str
    generation: int
    anchor: datetime
    now: datetime
    created_at: datetime
    updated_at: datetime

    def __post_init__(self) -> None:
        if not OWNER_PATTERN.fullmatch(self.owner):
            raise DomainValidationError(
                "SimulatedWorkspace.owner must be an opaque account identifier"
            )
        if self.generation < 1:
            raise DomainValidationError("SimulatedWorkspace.generation must be at least 1")
        for name in ("anchor", "now", "created_at", "updated_at"):
            object.__setattr__(
                self, name, require_aware_utc(getattr(self, name), f"SimulatedWorkspace.{name}")
            )
        if self.now < self.anchor:
            raise DomainValidationError("SimulatedWorkspace.now cannot precede its anchor")

    @property
    def student(self) -> ExternalRef:
        return ExternalRef(f"{SIMULATED_PROVIDER_PREFIX}{self.generation}", self.owner)


class SimulatedWorkspaceRepository(Protocol):
    def get(self, owner: str, *, for_update: bool = False) -> SimulatedWorkspace | None:
        """Return the account's workspace; ``for_update`` serializes concurrent writers."""
        ...

    def add(self, workspace: SimulatedWorkspace) -> SimulatedWorkspace:
        """Insert a new workspace; a second insert for the same owner must fail."""
        ...

    def save(self, workspace: SimulatedWorkspace) -> SimulatedWorkspace:
        """Replace an existing workspace."""
        ...
