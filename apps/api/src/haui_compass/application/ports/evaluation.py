"""Request-local, optional observation contract; no persistence or vendor dependencies."""

from contextvars import ContextVar

evaluation_events: ContextVar[list[dict[str, object]] | None] = ContextVar(
    "evaluation_events", default=None
)


def record_provider_metadata(metadata: dict[str, object]) -> None:
    events = evaluation_events.get()
    if events is not None:
        events.append(metadata)
