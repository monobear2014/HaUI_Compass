"""confirm_reflection_signals: the only way a ConfirmedReflectionSignals may be constructed.

Pure: given a candidate and the signals the student selected from it, returns a
``ConfirmedReflectionSignals`` containing exactly those signals, in the order selected. Confirming
nothing (an empty selection) is valid: the student may reject every proposal.

Confirmation never invents information the candidate did not already propose. Each selected signal
must equal one still available on the candidate; selecting the same signal twice is rejected as
"not this many times", not silently accepted, and selecting something the candidate never proposed
is rejected outright.
"""

from collections import Counter
from collections.abc import Iterable
from datetime import datetime

from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    ConfirmedReflectionSignals,
    ReflectionSignal,
)
from haui_compass.domain.shared.errors import DomainValidationError


class ReflectionSignalNotCandidateError(DomainValidationError):
    """A signal was selected for confirmation that the candidate never proposed (or not that
    many times)."""


def confirm_reflection_signals(
    candidate: CandidateReflectionSignals,
    *,
    selected: Iterable[ReflectionSignal],
    confirmed_at: datetime,
) -> ConfirmedReflectionSignals:
    available = Counter(candidate.signals)
    chosen: list[ReflectionSignal] = []
    for signal in selected:
        if available[signal] <= 0:
            raise ReflectionSignalNotCandidateError(
                f"{signal!r} was not among the candidate signals for this reflection period"
            )
        available[signal] -= 1
        chosen.append(signal)

    return ConfirmedReflectionSignals(
        student_id=candidate.student_id,
        period=candidate.period,
        confirmed_at=confirmed_at,
        signals=tuple(chosen),
    )
