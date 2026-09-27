"""Assignment: a deliverable with a deadline, belonging to one course."""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import NewType
from uuid import UUID

from haui_compass.domain.courses.course import CourseId
from haui_compass.domain.shared.validation import (
    require_aware_utc,
    require_non_blank,
    require_non_negative,
)

AssignmentId = NewType("AssignmentId", UUID)


@dataclass(frozen=True, slots=True, kw_only=True)
class Assignment:
    """``deadline`` is stored in UTC. ``estimated_effort`` is the total expected work, if known."""

    id: AssignmentId
    course_id: CourseId
    title: str
    deadline: datetime
    estimated_effort: timedelta | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "title", require_non_blank(self.title, "Assignment.title"))
        object.__setattr__(
            self, "deadline", require_aware_utc(self.deadline, "Assignment.deadline")
        )
        if self.estimated_effort is not None:
            require_non_negative(self.estimated_effort, "Assignment.estimated_effort")
