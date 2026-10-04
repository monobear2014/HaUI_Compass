"""Deterministic, academically safe decomposition for offline demos."""

from haui_compass.application.ports.task_decomposition import (
    ProviderTaskCandidate,
    TaskDecompositionInput,
)


class DeterministicTaskDecompositionProvider:
    async def decompose(self, context: TaskDecompositionInput) -> tuple[ProviderTaskCandidate, ...]:
        subject = context.assignment_title
        return (
            ProviderTaskCandidate(
                title=f"Clarify requirements for {subject}",
                estimated_duration_minutes=30,
                rationale="Identify scope, constraints and success criteria before producing work.",
            ),
            ProviderTaskCandidate(
                title=f"Design the approach for {subject}",
                estimated_duration_minutes=45,
                rationale=(
                    "Create a structure or design that the student can review before "
                    "implementation."
                ),
            ),
            ProviderTaskCandidate(
                title=f"Implement one core increment for {subject}",
                estimated_duration_minutes=60,
                rationale=(
                    "Build a bounded part of the solution rather than a complete submission "
                    "at once."
                ),
            ),
            ProviderTaskCandidate(
                title=f"Test and review {subject}",
                estimated_duration_minutes=45,
                rationale=(
                    "Check behavior, evidence and rubric alignment, then record remaining work."
                ),
            ),
        )
