"""PostgreSQL simulated workspaces; one row per account, locked while its clock moves."""

from collections.abc import Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from haui_compass.application.ports.persistence import PersistenceError, PersistenceErrorCode
from haui_compass.application.ports.simulated_workspaces import SimulatedWorkspace
from haui_compass.infrastructure.persistence.postgres.mapping import utc
from haui_compass.infrastructure.persistence.postgres.models import SimulatedWorkspaceRow


class PostgresSimulatedWorkspaceRepository:
    def __init__(self, session_provider: Callable[[], Session]) -> None:
        self._session_provider = session_provider

    def get(self, owner: str, *, for_update: bool = False) -> SimulatedWorkspace | None:
        statement = select(SimulatedWorkspaceRow).where(SimulatedWorkspaceRow.owner_id == owner)
        if for_update:
            statement = statement.with_for_update()
        row = self._session_provider().scalar(statement)
        return None if row is None else _to_domain(row)

    def add(self, workspace: SimulatedWorkspace) -> SimulatedWorkspace:
        session = self._session_provider()
        if session.get(SimulatedWorkspaceRow, workspace.owner) is not None:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_CONFLICT, "simulated workspace already exists"
            )
        # A concurrent first request may still win the primary key; that transaction rolls back.
        row = SimulatedWorkspaceRow(owner_id=workspace.owner)
        _write(row, workspace)
        session.add(row)
        session.flush()
        return workspace

    def save(self, workspace: SimulatedWorkspace) -> SimulatedWorkspace:
        session = self._session_provider()
        row = session.get(SimulatedWorkspaceRow, workspace.owner)
        if row is None:
            raise PersistenceError(
                PersistenceErrorCode.RECORD_NOT_FOUND, "simulated workspace was not found"
            )
        _write(row, workspace)
        session.flush()
        return workspace


def _write(row: SimulatedWorkspaceRow, workspace: SimulatedWorkspace) -> None:
    row.generation = workspace.generation
    row.anchor = utc(workspace.anchor)
    row.virtual_now = utc(workspace.now)
    row.created_at = utc(workspace.created_at)
    row.updated_at = utc(workspace.updated_at)


def _to_domain(row: SimulatedWorkspaceRow) -> SimulatedWorkspace:
    return SimulatedWorkspace(
        owner=row.owner_id,
        generation=row.generation,
        anchor=utc(row.anchor),
        now=utc(row.virtual_now),
        created_at=utc(row.created_at),
        updated_at=utc(row.updated_at),
    )
