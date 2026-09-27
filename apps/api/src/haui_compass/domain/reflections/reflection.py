"""Reflection: a student's own account of a fixed period of work, not a chatbot transcript.

A ``Reflection`` is one submission: the period it looks back on, when it was submitted, and the
student's typed answers (``ReflectionResponses``). It is deliberately not the end of the pipeline:
turning it into signals (``engines.reflection.candidates``) and getting the student to confirm
which of those signals are true (``engines.reflection.confirm``) are separate steps. See
``domain/reflections/signals.py`` for why candidate and confirmed signals are different types.

No ``ReflectionId``: nothing in this branch looks a reflection up or persists it independently of
its (student, period) identity. Persistence, if it needs an id, can add one later.
"""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum

from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc, require_non_blank
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


class ReflectionUnknownTaskError(DomainValidationError):
    """A reflection response referenced a task id the caller did not supply any context for."""


class WorkloadFeedback(StrEnum):
    """The student's own verdict on how much was asked of them this period. Self-reported only:
    never inferred from execution history (docs/research/intelliplan-reflection-reference.md)."""

    TOO_LIGHT = "too_light"
    APPROPRIATE = "appropriate"
    TOO_HEAVY = "too_heavy"


@dataclass(frozen=True, slots=True, kw_only=True)
class ReflectionPeriod:
    """The explicit window a ``Reflection`` looks back on. Always UTC; always non-empty."""

    start: datetime
    end: datetime

    def __post_init__(self) -> None:
        object.__setattr__(self, "start", require_aware_utc(self.start, "ReflectionPeriod.start"))
        object.__setattr__(self, "end", require_aware_utc(self.end, "ReflectionPeriod.end"))
        if self.end <= self.start:
            raise DomainValidationError("ReflectionPeriod.end must be strictly after start")


@dataclass(frozen=True, slots=True, kw_only=True)
class ReflectionResponses:
    """What the student actually answered. Every field here is self-report (Facts vs
    self-report, docs/research/intelliplan-reflection-reference.md); none of it is computed from
    execution history.

    ``reflected_task_ids``: tasks the student is giving feedback on this period. Not itself a
    signal; it scopes which tasks ``generate_candidate_signals`` may compare against execution
    facts for estimation feedback.

    Duplicate ids and duplicate topic labels are collapsed and sorted here, once, so every
    downstream consumer sees the same deterministic, order-independent set regardless of how the
    caller happened to list them.
    """

    reflected_task_ids: tuple[TaskId, ...] = ()
    workload_feedback: WorkloadFeedback | None = None
    difficult_topics: tuple[str, ...] = ()
    deferred_task_ids: tuple[TaskId, ...] = ()

    def __post_init__(self) -> None:
        object.__setattr__(self, "reflected_task_ids", _dedupe_task_ids(self.reflected_task_ids))
        object.__setattr__(self, "deferred_task_ids", _dedupe_task_ids(self.deferred_task_ids))
        object.__setattr__(self, "difficult_topics", _dedupe_topics(self.difficult_topics))


def _dedupe_task_ids(task_ids: tuple[TaskId, ...]) -> tuple[TaskId, ...]:
    return tuple(sorted(set(task_ids)))


def _dedupe_topics(topics: tuple[str, ...]) -> tuple[str, ...]:
    normalized = (
        require_non_blank(topic, "ReflectionResponses.difficult_topics") for topic in topics
    )
    # Case-insensitive de-duplication; the first-seen casing (in sorted-by-key order) is kept.
    by_key: dict[str, str] = {}
    for topic in normalized:
        key = topic.casefold()
        by_key.setdefault(key, topic)
    return tuple(by_key[key] for key in sorted(by_key))


@dataclass(frozen=True, slots=True, kw_only=True)
class Reflection:
    """One submission. Immutable once created; never mutated by later confirmation steps."""

    student_id: StudentId
    period: ReflectionPeriod
    submitted_at: datetime
    responses: ReflectionResponses

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "submitted_at", require_aware_utc(self.submitted_at, "Reflection.submitted_at")
        )
        if self.submitted_at < self.period.start:
            raise DomainValidationError(
                "Reflection.submitted_at must not be before the period it reflects on"
            )
