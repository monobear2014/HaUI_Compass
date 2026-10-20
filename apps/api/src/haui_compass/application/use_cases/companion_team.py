"""Bounded multi-agent handoffs over read-only tools and explicit confirmed memory.

The supervisor selects specialists, never writes schedules. A reflection→planner handoff
uses observed weekly facts plus a reviewed coach response. Every exchange crosses the
integrity boundary before delegation and the citation boundary inside the tutor.
"""

import asyncio
import re
import unicodedata
from dataclasses import dataclass

from haui_compass.application.abbreviations import expand_abbreviations
from haui_compass.application.academic_integrity import GUIDANCE, requires_guidance
from haui_compass.application.ports.companion import (
    AgentAdviceInput,
    AgentAdviceProvider,
    AgentRole,
)
from haui_compass.application.ports.knowledge import ConversationTurn, KnowledgeCourseId
from haui_compass.application.use_cases.query_knowledge import KnowledgeQueryRequest, QueryKnowledge


@dataclass(frozen=True, slots=True)
class AgentResult:
    answer: str
    agent: str
    source: str
    citations: tuple[dict[str, object], ...] = ()
    fallback_reason: str | None = None


def _plain(value: str) -> str:
    return "".join(
        c
        for c in unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
        if unicodedata.category(c) != "Mn"
    )


_SMALL_TALK = re.compile(
    r"^(?:ok(?:e+|ay)?|oki|okie|uh+|u+m+|vang|da|ung|dung roi|duoc|duoc roi|hieu roi|"
    r"minh hieu roi|em hieu roi|toi hieu roi|ro roi|tot|hay|hay qua|tuyet|good|great|nice|"
    r"cam on|cam on ban|cam on nhe|cam on nhieu|thanks?|thank you|tks|ty|"
    r"xin chao|chao|chao ban|hello|hi|hey|bye|tam biet)(?: (?:nhe|nha|a|ban|nhieu|nhe ban))*$"
)


def is_small_talk(question: str) -> bool:
    value = re.sub(r"[^\w\s]", " ", _plain(question))
    return bool(_SMALL_TALK.match(" ".join(value.split())))


def small_talk_reply(question: str) -> str:
    value = _plain(question)
    if any(t in value for t in ("cam on", "thank", "tks")):
        return "Không có gì đâu! Còn chỗ nào chưa rõ thì cứ hỏi mình nhé."
    if any(t in value for t in ("chao", "hello", "hi", "hey")) and "hieu" not in value:
        return "Chào bạn! Hôm nay bạn muốn ôn phần nào, hay cần mình giúp lên kế hoạch học?"
    if any(t in value for t in ("bye", "tam biet")):
        return "Tạm biệt bạn, học tốt nhé! Cần gì cứ quay lại hỏi mình."
    return "Oke bạn! Nếu còn thắc mắc gì hay muốn mình giải thích thêm phần nào, cứ hỏi mình nhé."


class SupervisorAgent:
    def delegate(self, question: str, mode: str) -> tuple[str, ...]:
        if is_small_talk(question):
            return ("chat",)
        if mode != "auto":
            return (mode,)
        value = _plain(question)
        planning = any(t in value for t in ("ke hoach", "sap lich", "tuan sau", "plan "))
        reflecting = any(
            t in value for t in ("phan tu", "tuan truoc", "nhin lai", "tong ket", "reflect")
        )
        if planning and reflecting:
            return ("reflect", "plan")
        if reflecting:
            return ("reflect",)
        if planning:
            return ("plan",)
        if any(
            t in value
            for t in ("hom nay", "bat dau tu dau", "viec tiep theo", "lam gi truoc", "deadline")
        ):
            return ("do",)
        return ("tutor",)


class MemoryAgent:
    def context(
        self, confirmed: tuple[str, ...], preferences: dict[str, object] | None
    ) -> tuple[str, ...]:
        # Data only. It never infers, confirms or saves a new memory.
        result = list(confirmed[:20])
        if preferences:
            result.append(
                "Mục tiêu tự khai mỗi tuần: "
                + str(preferences.get("weekly_target_minutes", 0))
                + " phút"
            )
            topics = preferences.get("difficult_topics", [])
            if isinstance(topics, list):
                result.extend("Chủ đề tự thấy khó: " + str(t) for t in topics[:5])
        return tuple(result)


class AdviceAgent:
    def __init__(
        self, role: AgentRole, provider: AgentAdviceProvider | None, timeout: float
    ) -> None:
        self.role, self.provider, self.timeout = role, provider, timeout

    async def run(
        self,
        question: str,
        facts: dict[str, object],
        memory: tuple[str, ...],
        history: tuple[dict[str, str], ...],
        handoff: str = "",
    ) -> AgentResult:
        fallback = {
            "companion": small_talk_reply(question)
            if is_small_talk(question)
            else (
                "Câu này mình chưa tìm thấy trong học liệu của môn. Bạn thử diễn đạt lại "
                "bằng thuật ngữ trong bài giảng, hoặc chọn đúng môn tài liệu nhé."
            ),
            "planner": (
                "Hãy kiểm tra bài tập và deadline trong Kế hoạch tuần, chọn thời "
                "gian rảnh thực tế rồi xem đề xuất trước khi duyệt. Các sở thích đã "
                "lưu chỉ được áp dụng khi bạn xác nhận."
            ),
            "study_coach": (
                "Mở Hôm nay để xem việc tiếp theo do hệ thống ưu tiên theo "
                "deadline. Bắt đầu một bước nhỏ, ghi lại thời gian thực tế; hoàn "
                "thành việc học không đồng nghĩa đã nộp bài."
            ),
            "reflector": (
                "So sánh thời gian thực học với kế hoạch và xem các việc còn mở. "
                "Điều gì đã giúp bạn học được, điều gì cản trở? Tuần sau bạn muốn "
                "thay đổi một điều cụ thể nào?"
            ),
        }[self.role]
        reason = "not_configured"
        if self.provider:
            try:
                answer = await asyncio.wait_for(
                    self.provider.advise(
                        AgentAdviceInput(self.role, question, facts, memory, history, handoff)
                    ),
                    self.timeout,
                )
                if (
                    isinstance(answer, str)
                    and 10 <= len(answer.strip()) <= 3500
                    and not re.search(
                        r"[0-9a-f]{8}-[0-9a-f]{4}-|planned_minutes|weaknesses|missed_sessions",
                        answer,
                        re.I,
                    )
                ):
                    return AgentResult(answer.strip(), self.role, "ai")
                reason = "invalid_output"
            except TimeoutError:
                reason = "timeout"
            except Exception:
                reason = "provider_error"
        return AgentResult(fallback, self.role, "template", fallback_reason=reason)


class TutorAgent:
    def __init__(self, knowledge: QueryKnowledge, companion: "AdviceAgent") -> None:
        self.knowledge = knowledge
        self.companion = companion

    async def run(
        self,
        question: str,
        course: KnowledgeCourseId,
        history: tuple[dict[str, str], ...],
        memory: tuple[str, ...],
    ) -> AgentResult:
        result = await self.knowledge.execute(
            KnowledgeQueryRequest(
                question=question,
                scope="course",
                course_id=course,
                public_only=course not in {"db", "se"},
                history=tuple(
                    ConversationTurn(
                        role="user" if r["role"] == "user" else "assistant", content=r["content"]
                    )
                    for r in history[-6:]
                ),
                preferences=memory,
            )
        )
        citations: tuple[dict[str, object], ...] = tuple(
            {
                "title": c.title,
                "source_url": c.source_url,
                "page": c.page,
                "section": c.section,
                "source_type": c.source_type,
            }
            for c in result.citations
        )
        if result.status == "abstained" and result.fallback_reason in {
            "insufficient_evidence",
            "provider_abstained",
        }:
            # Uncited general-knowledge reply; the companion prompt says it is not from materials.
            general = await self.companion.run(
                expand_abbreviations(question),
                {"course_id": course, "course_materials": "no matching excerpt"},
                memory,
                history[-6:],
            )
            if general.source == "ai":
                return AgentResult(general.answer, "tutor", "ai", (), "general_knowledge")
        return AgentResult(result.answer, "tutor", result.source, citations, result.fallback_reason)


class CompanionTeam:
    def __init__(
        self, knowledge: QueryKnowledge, provider: AgentAdviceProvider | None, timeout: float = 8.0
    ) -> None:
        self.supervisor = SupervisorAgent()
        self.memory_agent = MemoryAgent()
        companion = AdviceAgent("companion", provider, timeout)
        self.tutor = TutorAgent(knowledge, companion)
        self.specialists = {
            "chat": companion,
            "plan": AdviceAgent("planner", provider, timeout),
            "do": AdviceAgent("study_coach", provider, timeout),
            "reflect": AdviceAgent("reflector", provider, timeout),
        }

    async def run(
        self,
        *,
        question: str,
        mode: str,
        course: KnowledgeCourseId,
        facts: dict[str, dict[str, object]],
        confirmed_memory: tuple[str, ...],
        preferences: dict[str, object] | None,
        history: tuple[dict[str, str], ...],
    ) -> dict[str, object]:
        previous = tuple(r["content"] for r in history if r["role"] == "user")
        if requires_guidance(question, previous):
            return {
                "answer": GUIDANCE,
                "citations": [],
                "agents": ["integrity_guard"],
                "source": "template",
                "basis": "guidance",
                "action": None,
                "fallback_reason": "academic_integrity",
                "memory_used": 0,
            }
        memory = self.memory_agent.context(confirmed_memory, preferences)
        route = self.supervisor.delegate(question, mode)
        results: list[AgentResult] = []
        for role in route:
            if role == "tutor":
                result = await self.tutor.run(
                    question,
                    course,
                    tuple(r for r in history if r.get("course_id", course) == course),
                    memory,
                )
            else:
                result = await self.specialists[role].run(
                    question,
                    facts.get(role, {}),
                    memory,
                    history[-6:],
                    results[-1].answer if results else "",
                )
            results.append(result)
        last = route[-1]
        return {
            "answer": "\n\n".join(r.answer for r in results),
            "citations": [c for r in results for c in r.citations],
            "agents": ["supervisor", "memory", *(r.agent for r in results), "validation"],
            "source": "ai" if all(r.source == "ai" for r in results) else "template",
            "basis": "general"
            if results[-1].fallback_reason == "general_knowledge"
            else {"tutor": "courseware", "chat": "conversation"}.get(last, "learning_records"),
            "action": {
                "href": {
                    "plan": "/plan",
                    "do": "/today",
                    "reflect": "/reflect",
                    "tutor": f"/knowledge?course={course}",
                }[last]
            }
            if last != "chat"
            else None,
            "fallback_reason": next(
                (r.fallback_reason for r in results if r.fallback_reason), None
            ),
            "memory_used": len(memory),
        }
