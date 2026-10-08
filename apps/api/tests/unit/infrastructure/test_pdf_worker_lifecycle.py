import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from haui_compass.application.ports.documents import PdfExtractionError
from haui_compass.infrastructure.retrieval.pdf import PypdfTextExtractor


@pytest.mark.parametrize("cancelled", [False, True])
def test_worker_is_killed_and_reaped_on_timeout_or_cancellation(
    monkeypatch: pytest.MonkeyPatch, cancelled: bool
) -> None:
    async def run() -> None:
        pending: asyncio.Future[tuple[bytes, bytes]] = asyncio.Future()
        process = SimpleNamespace(
            returncode=None,
            communicate=Mock(return_value=pending),
            kill=Mock(),
            wait=AsyncMock(return_value=-9),
        )
        monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=process))
        monkeypatch.setattr(
            asyncio,
            "wait_for",
            AsyncMock(side_effect=asyncio.CancelledError if cancelled else TimeoutError),
        )
        with pytest.raises(asyncio.CancelledError if cancelled else PdfExtractionError):
            await PypdfTextExtractor().extract(b"%PDF")
        process.kill.assert_called_once()
        process.wait.assert_awaited_once()
        pending.cancel()

    asyncio.run(run())
