"""In-memory simulated workspaces for development and tests."""

from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.simulated_workspaces import SimulatedWorkspace


class InMemorySimulatedWorkspaceRepository:
    def __init__(self) -> None:
        self._workspaces: dict[str, SimulatedWorkspace] = {}

    def get(self, owner: str, *, for_update: bool = False) -> SimulatedWorkspace | None:
        return self._workspaces.get(owner)

    def add(self, workspace: SimulatedWorkspace) -> SimulatedWorkspace:
        if workspace.owner in self._workspaces:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT, "simulated workspace already exists"
            )
        self._workspaces[workspace.owner] = workspace
        return workspace

    def save(self, workspace: SimulatedWorkspace) -> SimulatedWorkspace:
        if workspace.owner not in self._workspaces:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_NOT_FOUND, "simulated workspace was not found"
            )
        self._workspaces[workspace.owner] = workspace
        return workspace
