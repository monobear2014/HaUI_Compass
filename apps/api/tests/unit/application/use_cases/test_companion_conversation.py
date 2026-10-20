import asyncio

import pytest

from haui_compass.application.abbreviations import abbreviation_notes, expand_abbreviations
from haui_compass.application.ports.companion import AgentAdviceInput
from haui_compass.application.use_cases.companion_team import (
    CompanionTeam,
    SupervisorAgent,
    is_small_talk,
)
from haui_compass.application.use_cases.query_knowledge import (
    KnowledgeQueryRequest,
    KnowledgeQueryResult,
)


@pytest.mark.parametrize("text", ["oke", "Ok nhé", "cảm ơn bạn!", "Cảm ơn nhiều", "hiểu rồi"])
def test_acknowledgements_are_small_talk(text: str) -> None:
    assert is_small_talk(text)
    assert SupervisorAgent().delegate(text, "tutor") == ("chat",)


@pytest.mark.parametrize(
    "text", ["ML là gì?", "oke vậy overfitting là gì", "cảm ơn, giải thích CNN"]
)
def test_real_questions_are_not_small_talk(text: str) -> None:
    assert not is_small_talk(text)


def test_abbreviations_expand_without_losing_original() -> None:
    assert expand_abbreviations("ML là gì?").startswith("ML machine learning")
    assert "html" in expand_abbreviations("html")
    assert abbreviation_notes("So sánh ML và DL, ml") == (
        "ML = machine learning học máy",
        "DL = deep learning học sâu",
    )


class Knowledge:
    async def execute(self, request: KnowledgeQueryRequest) -> KnowledgeQueryResult:
        return KnowledgeQueryResult(
            answer="refusal",
            status="abstained",
            citations=(),
            retrieved=(),
            source="template",
            fallback_reason="insufficient_evidence",
        )


class Advice:
    def __init__(self) -> None:
        self.requests: list[AgentAdviceInput] = []

    async def advise(self, request: AgentAdviceInput) -> str:
        self.requests.append(request)
        return "Câu trả lời tự nhiên từ kiến thức chung."


def run(team: CompanionTeam, question: str) -> dict[str, object]:
    return asyncio.run(
        team.run(
            question=question,
            mode="auto",
            course="ml",
            facts={},
            confirmed_memory=(),
            preferences=None,
            history=(),
        )
    )


def test_small_talk_has_friendly_reply_without_llm() -> None:
    result = run(CompanionTeam(Knowledge(), None), "oke")  # type: ignore[arg-type]
    assert "cứ hỏi mình" in str(result["answer"])
    assert result["basis"] == "conversation" and result["action"] is None


def test_unmatched_question_falls_back_to_labelled_general_knowledge() -> None:
    advice = Advice()
    result = run(CompanionTeam(Knowledge(), advice), "Transformer là gì?")  # type: ignore[arg-type]
    assert result["answer"] == "Câu trả lời tự nhiên từ kiến thức chung."
    assert result["basis"] == "general" and result["citations"] == []
    assert advice.requests[0].role == "companion"
