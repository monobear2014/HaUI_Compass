"""Playwright fixture: real application/adapter with only external LLM transport replaced.

Not imported by production entry points; never makes network requests or uses real keys.
"""

import asyncio
import json
from collections.abc import Mapping
from dataclasses import replace

from haui_compass.api.demo import create_demo_app
from haui_compass.api.v1.routes import container_from_app
from haui_compass.infrastructure.config.llm import LLMSettings
from haui_compass.infrastructure.llm.openai_responses import OpenAIResponsesAdapter


class FixtureTransport:
    calls: int = 0

    async def post_json(
        self,
        *,
        url: str,
        headers: Mapping[str, str],
        payload: Mapping[str, object],
        timeout_seconds: float,
    ) -> object:
        self.calls += 1
        await asyncio.sleep(0.6 if "lease" in str(payload["input"]) else 0.1)
        assert isinstance(payload["input"], str)
        context = json.loads(payload["input"])
        evidence = context["evidence"]
        question = context["question"]
        prefix = "Theo tài liệu: "
        if "nó" in question and context["recent_conversation"]:
            prefix = "Hỏi tiếp về softmax: "
        answer = prefix + evidence[0]["content"][:500]
        if "đặt một câu hỏi" in question:
            answer = "Softmax có vai trò gì trong phân loại nhiều lớp?"
        if "kiểm tra giả" in question:
            handles = ["fabricated"]
        else:
            handles = [row["citation_handle"] for row in evidence]
        text = json.dumps({"answer": answer, "citation_handles": handles, "abstained": False})
        return {
            "status": "completed",
            "output": [{"type": "message", "content": [{"type": "output_text", "text": text}]}],
        }


app = create_demo_app()
session = app.state.demo
transport = FixtureTransport()
provider = OpenAIResponsesAdapter(
    LLMSettings(enabled=True, api_key="fixture-only"), transport=transport
)
service = replace(session.container).compass_answer
service.provider = provider
app.state.demo = replace(session, container=replace(session.container, compass_answer=service))

# Demo scenario selection replaces the container. Keep the fixture transport only
# at the dependency boundary so subsequent scenarios also use it for private chat.
app.dependency_overrides[container_from_app] = lambda: replace(
    app.state.demo.container, compass_answer=service
)


@app.get("/_test/compass/calls")
def generation_call_count() -> dict[str, int]:
    return {"calls": transport.calls}
