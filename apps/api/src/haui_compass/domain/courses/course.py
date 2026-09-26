"""Course: an academic context a student is enrolled in."""

from dataclasses import dataclass
from typing import NewType
from uuid import UUID

from haui_compass.domain.shared.validation import require_non_blank

CourseId = NewType("CourseId", UUID)


@dataclass(frozen=True, slots=True, kw_only=True)
class Course:
    id: CourseId
    name: str

    def __post_init__(self) -> None:
        object.__setattr__(self, "name", require_non_blank(self.name, "Course.name"))
