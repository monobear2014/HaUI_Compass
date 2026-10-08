import asyncio
from datetime import timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest

from haui_compass.api.dependencies import build_container
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.task_decomposition import (
    ConfirmedCandidateEdit,
    ProviderTaskCandidate,
    TaskCandidateId,
    TaskDecompositionInput,
    TaskDecompositionSessionId,
)
from haui_compass.application.use_cases.task_decomposition import (
    ConfirmTaskDecompositionRequest,
    GenerateTaskDecompositionRequest,
    TaskDecompositionError,
)
from haui_compass.infrastructure.demo.scenarios import NOW, DemoClock, ScenarioId, scenario_data
from haui_compass.infrastructure.lms.mock import MockLMSProvider


class FakeProvider:
    def __init__(self, mode: str) -> None:
        self.mode = mode
        self.context: TaskDecompositionInput | None = None

    async def decompose(self, context: TaskDecompositionInput) -> tuple[ProviderTaskCandidate, ...]:
        self.context = context
        valid = ProviderTaskCandidate(
            title="Review project requirements",
            estimated_duration_minutes=30,
            rationale="Identify scope and constraints.",
        )
        if self.mode == "timeout":
            await asyncio.sleep(10)
        if self.mode == "exception":
            raise RuntimeError("simulated provider failure")
        if self.mode == "empty":
            return ()
        if self.mode == "excessive":
            return tuple(
                ProviderTaskCandidate(title=f"Candidate {index}", estimated_duration_minutes=30)
                for index in range(6)
            )
        if self.mode == "bad_title":
            return (ProviderTaskCandidate(title=" ", estimated_duration_minutes=30),)
        if self.mode == "bad_duration":
            return (ProviderTaskCandidate(title="Valid title", estimated_duration_minutes=0),)
        if self.mode == "duplicate":
            return (valid, valid)
        if self.mode == "malformed":
            return cast(tuple[ProviderTaskCandidate, ...], ({"title": "raw vendor object"},))
        return (
            valid,
            ProviderTaskCandidate(
                title="Design project schema",
                estimated_duration_minutes=45,
                rationale="Produce a reviewable design.",
            ),
            ProviderTaskCandidate(
                title="Test the first increment",
                estimated_duration_minutes=30,
                rationale="Verify behavior before continuing.",
            ),
        )


def setup(mode: str = "valid") -> tuple[Any, ...]:
    scenario = scenario_data(ScenarioId.NORMAL, NOW)
    provider = FakeProvider(mode)
    container = build_container(
        lms=MockLMSProvider({scenario.student: scenario.records}),
        clock=DemoClock(),
        task_decomposition_provider=provider,
        task_decomposition_timeout_seconds=0.01 if mode == "timeout" else 2.0,
    )
    assignment = next(row for row in scenario.records[1] if row.ref.id.endswith("capstone"))
    request = GenerateTaskDecompositionRequest(
        session_id=TaskDecompositionSessionId(uuid4()),
        student=scenario.student,
        assignment=assignment.ref,
    )
    return container, scenario, provider, request


def generate(mode: str = "valid") -> tuple[Any, ...]:
    container, scenario, provider, request = setup(mode)
    session = asyncio.run(container.generate_task_decomposition.execute(request))
    return container, scenario, provider, request, session


def test_valid_provider_output_is_typed_bounded_and_not_persisted() -> None:
    container, scenario, provider, _, session = generate()
    assert provider.context is not None
    assert provider.context.assignment_title == "Database Mini Project"
    assert provider.context.course_name == "Databases"
    assert provider.context.course_code == "FICTION-DB"
    assert session.source == "ai"
    assert session.fallback_reason is None
    assert len(session.candidates) == 3
    assert all(candidate.source == "ai" for candidate in session.candidates)
    assert container.task_repository.list_for_student(student_id_for(scenario.student)) == ()


@pytest.mark.parametrize(
    "mode",
    ["empty", "excessive", "bad_title", "bad_duration", "duplicate", "malformed"],
)
def test_invalid_provider_output_uses_deterministic_fallback(mode: str) -> None:
    _, _, _, _, session = generate(mode)
    assert session.source == "demo_fallback"
    assert session.fallback_reason == "invalid_output"
    assert len(session.candidates) == 4
    assert [candidate.estimated_duration_minutes for candidate in session.candidates] == [
        30,
        45,
        60,
        45,
    ]


@pytest.mark.parametrize(
    ("mode", "reason"), [("timeout", "timeout"), ("exception", "provider_error")]
)
def test_provider_failure_does_not_break_offline_demo(mode: str, reason: str) -> None:
    container, _, _, request = setup(mode)
    session = asyncio.run(container.generate_task_decomposition.execute(request))
    assert session.source == "demo_fallback"
    assert session.fallback_reason == reason


def test_confirmation_uses_only_selected_user_edited_values_and_is_idempotent() -> None:
    container, scenario, _, _, session = generate()
    first, _, third = session.candidates
    selection = (
        ConfirmedCandidateEdit(
            candidate_id=first.id,
            title="Clarify rubric and project scope",
            estimated_duration_minutes=40,
        ),
        ConfirmedCandidateEdit(
            candidate_id=third.id,
            title="Run schema tests and review evidence",
            estimated_duration_minutes=35,
        ),
    )
    request = ConfirmTaskDecompositionRequest(
        session_id=session.id,
        student=scenario.student,
        selection=selection,
    )
    result = container.confirm_task_decomposition.execute(request)
    assert [(row.task.title, row.task.estimated_duration) for row in result.tasks] == [
        ("Clarify rubric and project scope", timedelta(minutes=40)),
        ("Run schema tests and review evidence", timedelta(minutes=35)),
    ]
    persisted = container.task_repository.list_for_student(student_id_for(scenario.student))
    assert {row.task.id: row for row in persisted} == {row.task.id: row for row in result.tasks}
    assert session.candidates[1].id not in {row.task.id for row in persisted}
    assert container.confirm_task_decomposition.execute(request) == result
    assert container.task_repository.list_for_student(student_id_for(scenario.student)) == persisted


@pytest.mark.parametrize(
    "selection",
    [
        (
            ConfirmedCandidateEdit(
                candidate_id=TaskCandidateId(UUID(int=999)),
                title="Arbitrary hidden candidate",
                estimated_duration_minutes=30,
            ),
        ),
        (),
    ],
)
def test_invalid_or_empty_selection_never_persists(
    selection: tuple[ConfirmedCandidateEdit, ...],
) -> None:
    container, scenario, _, _, session = generate()
    with pytest.raises(TaskDecompositionError):
        container.confirm_task_decomposition.execute(
            ConfirmTaskDecompositionRequest(
                session_id=session.id,
                student=scenario.student,
                selection=selection,
            )
        )
    assert container.task_repository.list_for_student(student_id_for(scenario.student)) == ()


def test_all_edits_are_validated_before_any_task_is_created() -> None:
    container, scenario, _, _, session = generate()
    selection = (
        ConfirmedCandidateEdit(
            candidate_id=session.candidates[0].id,
            title="A valid confirmed task",
            estimated_duration_minutes=30,
        ),
        ConfirmedCandidateEdit(
            candidate_id=session.candidates[1].id,
            title="x",
            estimated_duration_minutes=30,
        ),
    )
    with pytest.raises(TaskDecompositionError):
        container.confirm_task_decomposition.execute(
            ConfirmTaskDecompositionRequest(
                session_id=session.id,
                student=scenario.student,
                selection=selection,
            )
        )
    assert container.task_repository.list_for_student(student_id_for(scenario.student)) == ()
