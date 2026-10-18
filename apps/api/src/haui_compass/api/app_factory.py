"""FastAPI application factory, kept apart from the ``main`` entrypoint.

``main`` builds the process app at import time. Compositions that only need the factory import
it from here, so loading the entrypoint never re-enters itself (Vercel imports the entrypoint file
under its own module name, then the package's ``haui_compass.api.main`` a second time).
"""

from collections.abc import Sequence
from typing import Any, cast

from fastapi import FastAPI

from haui_compass.api.compass_chat import router as compass_router
from haui_compass.api.dependencies import AppContainer, build_container
from haui_compass.api.errors import register_error_handlers
from haui_compass.api.v1.routes import container_from_app, router
from haui_compass.api.v1.weekly import router as weekly_router


def create_app(
    container: AppContainer | None = None, *, dependencies: Sequence[Any] = ()
) -> FastAPI:
    resolved = container or build_container()
    # App-level dependencies apply to every route, including routes added after creation.
    app = FastAPI(title="HaUI Compass API", version="0.1.0", dependencies=list(dependencies))
    app.state.container = resolved

    def get_container() -> AppContainer:
        return cast(AppContainer, app.state.container)

    app.dependency_overrides[container_from_app] = get_container
    app.include_router(router, prefix="/api/v1")
    app.include_router(weekly_router, prefix="/api/v1")
    app.include_router(compass_router, prefix="/api/v1")
    register_error_handlers(app)
    return app
