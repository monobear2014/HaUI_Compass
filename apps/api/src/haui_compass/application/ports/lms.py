"""LMS boundary: the narrow, read-only port and the normalized records it returns.

These are application-boundary types, not domain entities. Provider-specific payloads (JSON,
HTML, vendor field names) stop inside the adapter that implements ``LMSProvider``; nothing here
carries a raw payload. The port has no credentials or tokens: authentication and base URLs are the
adapter's construction concern, so a credential-free source (the mock) satisfies the same contract
as a real LMS.

Identity is ``ExternalRef(provider, id)``. External ids are never assumed to equal domain ids; the
translation lives in ``application.lms_mapping``.
"""

from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import StrEnum
from typing import Protocol

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_blank,
    require_non_negative,
)


@dataclass(frozen=True, slots=True)
class ExternalRef:
    """An identifier in an external system: ``provider`` is the namespace, ``id`` the value.

    Two systems can reuse the same ``id`` without colliding because the provider is part of the
    identity.
    """

    provider: str
    id: str

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "provider", require_non_blank(self.provider, "ExternalRef.provider")
        )
        object.__setattr__(self, "id", require_non_blank(self.id, "ExternalRef.id"))

    def __str__(self) -> str:
        return f"{self.provider}:{self.id}"


class LMSEntity(StrEnum):
    STUDENT = "student"
    COURSE = "course"
    ASSIGNMENT = "assignment"


class LMSNotFoundError(LookupError):
    """The LMS does not know this student, course, or assignment."""

    def __init__(self, entity: LMSEntity, ref: ExternalRef) -> None:
        super().__init__(f"unknown {entity.value}: {ref}")
        self.entity = entity
        self.ref = ref


@dataclass(frozen=True, slots=True, kw_only=True)
class LMSCourseRecord:
    """A course as the LMS reports it. Only the fields the MVP uses."""

    ref: ExternalRef
    name: str
    code: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", require_non_blank(self.name, "LMSCourseRecord.name"))
        if self.code is not None:
            object.__setattr__(self, "code", require_non_blank(self.code, "LMSCourseRecord.code"))


@dataclass(frozen=True, slots=True, kw_only=True)
class LMSAssignmentRecord:
    """An assignment as the LMS reports it.

    ``deadline`` is ``None`` when the LMS gives no due date; it is normalised to UTC otherwise and
    a naive datetime is rejected.

    ``estimated_effort`` is optional planning data that most real LMSs do **not** provide. A real
    adapter returns ``None``; only ``MockLMSProvider`` supplies (synthetic) values, so that later
    slices can exercise the risk engine without inventing effort in production code.
    """

    ref: ExternalRef
    course_ref: ExternalRef
    title: str
    deadline: datetime | None
    estimated_effort: timedelta | None = None

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "title", require_non_blank(self.title, "LMSAssignmentRecord.title")
        )
        if self.course_ref.provider != self.ref.provider:
            raise DomainValidationError(
                "LMSAssignmentRecord and its course are from different providers"
            )
        if self.deadline is not None:
            object.__setattr__(
                self, "deadline", require_aware_utc(self.deadline, "LMSAssignmentRecord.deadline")
            )
        if self.estimated_effort is not None:
            require_non_negative(self.estimated_effort, "LMSAssignmentRecord.estimated_effort")


class SubmissionStatus(StrEnum):
    """Normalised submission state. ``UNKNOWN`` means the LMS could not say; it is not a status."""

    NOT_SUBMITTED = "not_submitted"
    SUBMITTED = "submitted"
    LATE = "late"  # submitted after the deadline
    UNKNOWN = "unknown"


@dataclass(frozen=True, slots=True, kw_only=True)
class LMSSubmissionRecord:
    """The student's submission state for one assignment. No grades in v0."""

    assignment_ref: ExternalRef
    status: SubmissionStatus
    submitted_at: datetime | None = None

    def __post_init__(self) -> None:
        if self.submitted_at is not None:
            object.__setattr__(
                self,
                "submitted_at",
                require_aware_utc(self.submitted_at, "LMSSubmissionRecord.submitted_at"),
            )
        if self.status is SubmissionStatus.NOT_SUBMITTED and self.submitted_at is not None:
            raise DomainValidationError("a not-submitted submission cannot have a submission time")


class LMSProvider(Protocol):
    """Read-only access to one student's academic data in an LMS.

    Contract shared by every implementation (see ``tests/support/lms_contract.py``):

    - An unknown student raises ``LMSNotFoundError``. So does an unknown course or assignment in a
      filter. Failures are never disguised as empty results.
    - A filter of ``None`` means "all"; an empty filter means "none".
    - Results are immutable tuples in a deterministic order, and every ``ExternalRef`` carries the
      provider's own namespace.
    - Deadlines and submission times are timezone-aware UTC.
    """

    def get_courses(self, student: ExternalRef) -> tuple[LMSCourseRecord, ...]: ...

    def get_assignments(
        self, student: ExternalRef, *, courses: Collection[ExternalRef] | None = None
    ) -> tuple[LMSAssignmentRecord, ...]: ...

    def get_submission_statuses(
        self, student: ExternalRef, *, assignments: Collection[ExternalRef] | None = None
    ) -> tuple[LMSSubmissionRecord, ...]: ...
