"""Student identity.

Identifier strategy (shared by every aggregate): ``typing.NewType`` over ``uuid.UUID``.
It costs nothing at runtime, needs no wrapper class, and lets the type checker stop a
``CourseId`` from being passed where an ``AssignmentId`` is expected. The trade-off is that the
distinction exists only at type-check time; mixing them up in untyped code is not caught.
Provider ids (e.g. an LMS ``external_id``) are a separate concern and are not domain ids.
"""

from typing import NewType
from uuid import UUID

StudentId = NewType("StudentId", UUID)
