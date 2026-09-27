"""Reflection signals: candidate proposals and student-confirmed facts, kept as distinct types.

Every concrete signal is either a **fact**, derived from a task's own estimate and an execution
summary the caller supplies (``EstimationFeedbackSignal``), or a **self-report**, taken verbatim
from what the student answered (``WorkloadFeedbackSignal``, ``DifficultTopicSignal``,
``DeferredTaskSignal``). Neither kind is inferred from execution history by this branch; see
docs/research/intelliplan-reflection-reference.md, *Facts vs self-report*.

``CandidateReflectionSignals`` and ``ConfirmedReflectionSignals`` are deliberately not the same
type and not interchangeable: a candidate is a proposal the ``generate_candidate_signals`` engine
produced; only ``confirm_reflection_signals`` (``engines/reflection/confirm.py``) can turn some of
its signals into a ``ConfirmedReflectionSignals``, and only after explicit student confirmation.
Nothing may construct a ``ConfirmedReflectionSignals`` except that function.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta

from haui_compass.domain.reflections.reflection import ReflectionPeriod, WorkloadFeedback
from haui_compass.domain.shared.errors import DomainValidationError
from haui_compass.domain.shared.validation import require_aware_utc, require_non_negative
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskId


@dataclass(frozen=True, slots=True, kw_only=True)
class EstimationFeedbackSignal:
    """Fact: a task's own estimate next to the actual effort observed for it.

    Both numbers are kept, never collapsed into one corrected figure or ratio; deriving a
    calibration coefficient from many of these is explicitly future, data-gated work, not this
    signal's job.
    """

    task_id: TaskId
    estimated_duration: timedelta
    actual_duration: timedelta

    def __post_init__(self) -> None:
        require_non_negative(self.estimated_duration, "EstimationFeedbackSignal.estimated_duration")
        require_non_negative(self.actual_duration, "EstimationFeedbackSignal.actual_duration")


@dataclass(frozen=True, slots=True, kw_only=True)
class WorkloadFeedbackSignal:
    """Self-report: the student's own verdict on how much was asked of them this period."""

    reported: WorkloadFeedback


@dataclass(frozen=True, slots=True, kw_only=True)
class DifficultTopicSignal:
    """Self-report: an explicit topic label the student named as difficult.

    Not an inferred learning weakness and not a knowledge graph node; one label, verbatim.
    """

    topic: str


@dataclass(frozen=True, slots=True, kw_only=True)
class DeferredTaskSignal:
    """Self-report: the student explicitly said they put this task off.

    Never inferred from a late execution timestamp; a factual student statement only, which is why
    this is named after the fact (a deferral the student reported) and not a psychological label.
    """

    task_id: TaskId


# A candidate or confirmed signal is exactly one of these. Deliberately a closed set for v0
# (Structured Reflection v0 STEP 3): no personality profiles, motivation/productivity scores, or
# opaque behavioural scores belong here.
ReflectionSignal = (
    EstimationFeedbackSignal | WorkloadFeedbackSignal | DifficultTopicSignal | DeferredTaskSignal
)


@dataclass(frozen=True, slots=True, kw_only=True)
class CandidateReflectionSignals:
    """Proposals only. Nothing downstream of ``StudentState`` may consume these directly; they
    exist to be shown to the student for confirmation (``engines.reflection.confirm``)."""

    student_id: StudentId
    period: ReflectionPeriod
    signals: tuple[ReflectionSignal, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmedReflectionSignals:
    """Student-approved information. The only reflection output later slices may treat as fact.

    Constructed only by ``confirm_reflection_signals``, which enforces that every signal here was
    actually proposed by the ``CandidateReflectionSignals`` it was confirmed from.
    """

    student_id: StudentId
    period: ReflectionPeriod
    confirmed_at: datetime
    signals: tuple[ReflectionSignal, ...]

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "confirmed_at",
            require_aware_utc(self.confirmed_at, "ConfirmedReflectionSignals.confirmed_at"),
        )
        if self.confirmed_at < self.period.start:
            raise DomainValidationError(
                "ConfirmedReflectionSignals.confirmed_at must not be before the period it confirms"
            )
