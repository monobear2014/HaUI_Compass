"""Small, adapter-independent persistence error vocabulary."""

from enum import StrEnum


class PersistenceErrorCode(StrEnum):
    RECORD_NOT_FOUND = "record_not_found"
    RECORD_CONFLICT = "record_conflict"
    OWNERSHIP_CONFLICT = "ownership_conflict"
    PLAN_SCOPE_MISMATCH = "plan_scope_mismatch"
    STALE_PLAN_REVISION = "stale_plan_revision"


class PersistenceError(RuntimeError):
    """A storage-semantic failure that does not expose adapter-specific exceptions."""

    def __init__(self, code: PersistenceErrorCode, message: str) -> None:
        super().__init__(message)
        self.code = code
