"""ConfirmReflectionSignals: the student's explicit approval step.

    CandidateReflectionSignals + the signals the student picked
        -> confirm_reflection_signals (engine)
        -> ConfirmedReflectionSignals

Orchestration only; all the confirmation logic (what counts as "was actually proposed", duplicate
selection) is the engine's job. ``confirmed_at`` is read from the Clock exactly once: confirming is
an explicit action the student takes now, not a fact about the past.

Model-generated or self-reported conclusions are never auto-confirmed: this use case has no path
that produces a ``ConfirmedReflectionSignals`` without a caller-supplied ``selected_signals``.
"""

from dataclasses import dataclass

from haui_compass.application.ports.clock import Clock
from haui_compass.domain.reflections.signals import (
    CandidateReflectionSignals,
    ConfirmedReflectionSignals,
    ReflectionSignal,
)
from haui_compass.engines.reflection.confirm import confirm_reflection_signals


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmReflectionSignalsRequest:
    candidate: CandidateReflectionSignals
    selected_signals: tuple[ReflectionSignal, ...]


@dataclass(frozen=True, slots=True, kw_only=True)
class ConfirmReflectionSignalsResult:
    confirmed: ConfirmedReflectionSignals


class ConfirmReflectionSignals:
    def __init__(self, *, clock: Clock) -> None:
        self._clock = clock

    def execute(self, request: ConfirmReflectionSignalsRequest) -> ConfirmReflectionSignalsResult:
        """Raises ``ReflectionSignalNotCandidateError`` if a selected signal was not proposed by
        ``request.candidate`` (or was selected more times than it was proposed)."""
        now = self._clock.now()  # the only clock read; confirmation happens now
        confirmed = confirm_reflection_signals(
            request.candidate, selected=request.selected_signals, confirmed_at=now
        )
        return ConfirmReflectionSignalsResult(confirmed=confirmed)
