"""Persistent account-owned assistant, read-only agent tools and explicit memory CRUD."""

from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID, uuid5

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import Field, field_validator
from starlette.concurrency import run_in_threadpool

from haui_compass.api.compass_chat import EvidenceDTO, GenerateDTO, TurnDTO, generate_answer
from haui_compass.api.demo_context import snapshot
from haui_compass.api.dependencies import AppContainer
from haui_compass.api.learning_preferences import student_owner
from haui_compass.api.schemas.common import ApiModel
from haui_compass.api.v1.routes import container_dependency
from haui_compass.application.ports.companion import LEGACY_CONVERSATION_ID
from haui_compass.application.ports.knowledge import KnowledgeCourseId
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.use_cases.companion_team import CompanionTeam, SupervisorAgent
from haui_compass.application.use_cases.daily_recommendation import AssignmentCapacity
from haui_compass.application.use_cases.get_daily_recommendation import (
    GetDailyRecommendationRequest,
)
from haui_compass.domain.assignments.assignment import AssignmentId
from haui_compass.domain.plans.plan import PlanPeriod

router = APIRouter(prefix="/companion", tags=["companion"])


class MessageDTO(ApiModel):
    request_id: UUID
    conversation_id: UUID | None = None
    text: str = Field(min_length=3, max_length=500)
    mode: Literal["auto", "plan", "do", "tutor", "reflect"] = "auto"
    course_id: KnowledgeCourseId = "ai"
    document_id: UUID | None = None
    # Supplied only by the owner-scoped web retriever; browser values are stripped by the proxy.
    document_evidence: list[EvidenceDTO] = Field(default_factory=list, max_length=6)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError("Message is blank")
        return value.strip()


class MemoryDTO(ApiModel):
    identifier: UUID
    kind: Literal["learning_goal", "difficult_topic", "study_strategy", "response_preference"]
    content: str = Field(min_length=3, max_length=400)
    confirmed: Literal[True]

    @field_validator("content")
    @classmethod
    def nonblank(cls, value: str) -> str:
        if len(value.strip()) < 3:
            raise ValueError("Memory is blank")
        return value.strip()


@router.get("")
def history(request: Request, container: AppContainer = container_dependency) -> dict[str, object]:
    owner = student_owner(request)
    return container.transaction_manager.run(
        lambda: {
            "exchanges": container.companion_repository.exchanges(owner),
            "memories": container.companion_repository.memories(owner),
        }
    )


class ConversationDTO(ApiModel):
    identifier: UUID


class ImportedExchangeDTO(ApiModel):
    identifier: UUID
    question: str = Field(max_length=2000)
    answer: str = Field(max_length=16000)
    created_at: datetime
    citations: list[dict[str, object]] = Field(default_factory=list, max_length=6)


class ImportedConversationDTO(ApiModel):
    identifier: UUID
    document_id: UUID
    created_at: datetime
    exchanges: list[ImportedExchangeDTO] = Field(max_length=1000)


@router.post("/import-document-history")
def import_document_history(
    request: Request,
    body: ImportedConversationDTO,
    container: AppContainer = container_dependency,
) -> dict[str, bool]:
    # The web proxy blocks browser access to this route. The web backend reads only
    # owner-authorized legacy sessions and calls this endpoint with its service key.
    owner = student_owner(request)
    repo = container.companion_repository

    def store() -> None:
        repo.create_conversation(owner, body.identifier, body.created_at)
        for turn in body.exchanges:
            identifier = uuid5(body.identifier, str(turn.identifier))
            repo.save_exchange(
                owner,
                identifier,
                {
                    "id": str(identifier),
                    "conversation_id": str(body.identifier),
                    "question": turn.question,
                    "mode": "tutor",
                    "course_id": "ai",
                    "document_id": str(body.document_id),
                    "created_at": turn.created_at.isoformat(),
                    "response": {
                        "answer": turn.answer,
                        "citations": turn.citations,
                        "agents": ["tutor", "validation"],
                        "basis": "courseware",
                        "source": "ai",
                        "memory_used": 0,
                        "fallback_reason": None,
                        "action": None,
                    },
                },
            )

    container.transaction_manager.run(store)
    return {"imported": True}


@router.get("/conversations")
def list_conversations(
    request: Request,
    offset: int = Query(0, ge=0, le=100000),
    container: AppContainer = container_dependency,
) -> dict[str, object]:
    owner = student_owner(request)
    rows = container.transaction_manager.run(
        lambda: container.companion_repository.conversations(owner, 51, offset)
    )
    return {
        "account_id": owner,
        "conversations": rows[:50],
        "next_offset": offset + 50 if len(rows) > 50 else None,
    }


@router.post("/conversations")
def new_conversation(
    request: Request, body: ConversationDTO, container: AppContainer = container_dependency
) -> dict[str, str]:
    owner = student_owner(request)
    if body.identifier == LEGACY_CONVERSATION_ID:
        raise HTTPException(422, "Choose a new conversation ID")
    return container.transaction_manager.run(
        lambda: container.companion_repository.create_conversation(
            owner, body.identifier, datetime.now(UTC)
        )
    )


@router.get("/conversations/{identifier}")
def read_conversation(
    request: Request,
    identifier: UUID,
    before: UUID | None = None,
    container: AppContainer = container_dependency,
) -> dict[str, object]:
    owner = student_owner(request)

    def read() -> dict[str, object]:
        conversation = container.companion_repository.conversation(owner, identifier)
        if conversation is None:
            raise HTTPException(404, "Conversation not found")
        try:
            rows = container.companion_repository.exchanges(owner, 31, identifier, before)
        except ValueError:
            raise HTTPException(404, "Message cursor not found") from None
        page = rows[-30:]
        return {
            "conversation": conversation,
            "exchanges": page,
            "next_before": str(page[0]["id"]) if len(rows) > 30 else None,
        }

    return container.transaction_manager.run(read)


@router.delete("/history")
def clear_history(
    request: Request, container: AppContainer = container_dependency
) -> dict[str, bool]:
    owner = student_owner(request)
    container.transaction_manager.run(lambda: container.companion_repository.clear_history(owner))
    return {"cleared": True}


@router.post("/memory")
def save_memory(
    request: Request, body: MemoryDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)
    try:
        row = container.transaction_manager.run(
            lambda: container.companion_repository.save_memory(
                owner, body.identifier, body.kind, body.content, datetime.now(UTC)
            )
        )
    except ValueError:
        raise HTTPException(
            409, "At most 20 confirmed memories; edit or delete an existing one"
        ) from None
    return {"memory": row}


@router.delete("/memory/{identifier}")
def delete_memory(
    request: Request, identifier: UUID, container: AppContainer = container_dependency
) -> dict[str, bool]:
    owner = student_owner(request)
    deleted = container.transaction_manager.run(
        lambda: container.companion_repository.delete_memory(owner, identifier)
    )
    if not deleted:
        raise HTTPException(404, "Memory not found")
    return {"deleted": True}


def _facts(request: Request, container: AppContainer, owner: str) -> dict[str, dict[str, object]]:
    factory = getattr(request.app.state, "companion_context", None)
    if factory:
        context = factory(owner)
    elif getattr(request.app.state, "demo", None):
        context = snapshot(request.app.state.demo)
    else:
        raise HTTPException(503, "Learning workspace unavailable")
    student = ExternalRef(context.student["provider"], context.student["id"])
    period = PlanPeriod(start=context.period["start"], end=context.period["end"])
    draft = container.weekly_cycle.draft_goal(student, period)
    review = container.weekly_cycle.review(student, period)
    recommendation = container.get_daily_recommendation.execute(
        GetDailyRecommendationRequest(
            student=student,
            available_capacity=timedelta(minutes=context.available_minutes),
            assignment_capacities=tuple(
                AssignmentCapacity(
                    assignment_id=AssignmentId(UUID(str(c["assignment_id"]))),
                    available_until_deadline=timedelta(minutes=int(c["available_minutes"])),
                )
                for c in context.assignment_capacities
            ),
        )
    )
    task_id = getattr(recommendation.recommendation, "task_id", None)
    recommended = next((t for t in context.tasks if str(t.id) == str(task_id)), None)
    assignments = [
        {
            "tên": a.title,
            "môn": a.course,
            "hạn_nộp": a.deadline.isoformat(),
            "đã_nộp": a.submitted_at is not None,
        }
        for a in context.assignments
    ]
    previous_weeks = []
    for goal in container.weekly_cycle.goals(student)[-4:]:
        if goal.period.end > period.start:
            continue
        previous_review = container.weekly_cycle.review(student, goal.period)
        previous_weeks.append(
            {
                "từ": goal.period.start.isoformat(),
                "đến": goal.period.end.isoformat(),
                "mục_tiêu_đã_xác_nhận": goal.goal_text,
                "phút_dự_kiến": int(previous_review.planned.total_seconds() // 60),
                "phút_thực_học": int(previous_review.actual.total_seconds() // 60),
                "việc_hoàn_thành": sum(t.completed_this_period for t in previous_review.tasks),
            }
        )
    return {
        "plan": {
            "nguồn": "Tuần học Canvas giả lập của tài khoản hiện tại",
            "hiện_tại": context.now.isoformat(),
            "tuần": {k: v.isoformat() for k, v in context.period.items()},
            "bài_tập": assignments,
            "mục_tiêu_đã_lưu": draft.goal_text,
            "phút_gợi_ý_cho_tuần": draft.target_minutes,
            "các_tuần_đã_lưu": previous_weeks,
            "điều_chỉnh_đã_xác_nhận": [a.detail for a in draft.adjustments],
        },
        "do": {
            "nguồn": "Bộ ưu tiên deadline dựa trên dữ liệu học tập của tài khoản",
            "việc_được_ưu_tiên": recommended.title if recommended else None,
            "bài_tập": recommended.assignment_title if recommended else None,
            "hạn_nộp": recommended.deadline.isoformat() if recommended else None,
            "phút_ước_lượng": int(recommended.estimated_duration_seconds // 60)
            if recommended
            else None,
        },
        "reflect": {
            "nguồn": "Tổng kết tuần học giả lập của tài khoản hiện tại",
            "mục_tiêu": review.goal.goal_text if review.goal else "",
            "tuần_đang_xem": {k: v.isoformat() for k, v in context.period.items()},
            "các_tuần_đã_lưu": previous_weeks,
            "phút_dự_kiến": int(review.planned.total_seconds() // 60),
            "phút_thực_học": int(review.actual.total_seconds() // 60),
            "số_việc_hoàn_thành": sum(t.completed_this_period for t in review.tasks),
            "việc_còn_mở": [
                t.task.title for t in review.tasks if t.task.status.value != "completed"
            ],
        },
    }


@router.post("/messages")
async def send_message(
    request: Request, body: MessageDTO, container: AppContainer = container_dependency
) -> dict[str, object]:
    owner = student_owner(request)
    repo, tx = container.companion_repository, container.transaction_manager
    conversation_id = body.conversation_id or LEGACY_CONVERSATION_ID
    if body.conversation_id and tx.run(lambda: repo.conversation(owner, conversation_id)) is None:
        raise HTTPException(404, "Conversation not found")
    previous = tx.run(lambda: repo.exchange(owner, body.request_id))

    def check_match(value: dict[str, object]) -> None:
        if value.get("document_id") != (str(body.document_id) if body.document_id else None):
            raise HTTPException(409, "Request ID already used for another document")
        if str(value.get("conversation_id", LEGACY_CONVERSATION_ID)) != str(conversation_id):
            raise HTTPException(409, "Request ID already used in another conversation")
        if any(
            value.get(k) != v
            for k, v in {
                "question": body.text,
                "mode": body.mode,
                "course_id": body.course_id,
            }.items()
        ):
            raise HTTPException(409, "Request ID already used for another message")

    if previous:
        check_match(previous)
        return previous
    exchanges, memories, preferences = tx.run(
        lambda: (
            repo.exchanges(owner, 4, conversation_id),
            repo.memories(owner),
            container.learning_preferences.get(owner),
        )
    )
    recent = []
    for row in exchanges:
        reply = row.get("response", {})
        recent.append(
            {
                "role": "user",
                "content": str(row["question"]),
                "course_id": str(row.get("course_id", "")),
                "document_id": str(row.get("document_id", "")),
            }
        )
        recent.append(
            {
                "role": "assistant",
                "content": str(reply.get("answer", "")) if isinstance(reply, dict) else "",
                "course_id": str(row.get("course_id", "")),
                "document_id": str(row.get("document_id", "")),
            }
        )
    team = CompanionTeam(container.query_knowledge, container.agent_advice, container.agent_timeout)
    # No long database transaction is held while a model runs. Only read-only facts enter agents.
    if body.document_id and SupervisorAgent().delegate(body.text, body.mode) == ("tutor",):
        document_history = [
            turn for turn in recent if turn.get("document_id") == str(body.document_id)
        ]
        generated = await generate_answer(
            GenerateDTO(
                message=body.text,
                evidence=body.document_evidence,
                history=[
                    TurnDTO(role=turn["role"], content=turn["content"][:4000])
                    for turn in document_history[-8:]
                ],
            ),
            container,
            str(body.request_id),
        )
        cited_ids = generated.get("citations", [])
        result = {
            "answer": generated["answer"],
            "citations": [
                {
                    "title": row.filename,
                    "source_url": f"/study-set/{row.document_id}?chunk={row.chunk_id}",
                    "page": row.page_number,
                    "section": row.heading,
                    "source_type": "uploaded_private",
                }
                for row in body.document_evidence
                if row.chunk_id in cited_ids
            ],
            "agents": ["tutor", "validation"],
            "basis": "courseware",
            "source": "ai",
            "memory_used": 0,
            "fallback_reason": None,
            "action": None,
        }
    else:
        facts = await run_in_threadpool(_facts, request, container, owner)
        result = await team.run(
            question=body.text,
            mode=body.mode,
            course=body.course_id,
            facts=facts,
            confirmed_memory=tuple(m["kind"] + ": " + m["content"] for m in memories),
            preferences=preferences,
            history=tuple(recent),
        )
    value: dict[str, object] = {
        "id": str(body.request_id),
        "conversation_id": str(conversation_id),
        "question": body.text,
        "mode": body.mode,
        "course_id": body.course_id,
        "document_id": str(body.document_id) if body.document_id else None,
        "response": result,
        "created_at": datetime.now(UTC).isoformat(),
    }
    try:
        stored = tx.run(lambda: repo.save_exchange(owner, body.request_id, value))
    except ValueError:
        raise HTTPException(404, "Conversation no longer exists") from None
    check_match(stored)
    return stored
