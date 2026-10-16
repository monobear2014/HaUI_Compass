import os
from collections.abc import Sequence
from typing import Any, cast

from fastapi import FastAPI

from haui_compass.api.compass_chat import router as compass_router
from haui_compass.api.dependencies import AppContainer, build_container, build_runtime_container
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


def build_runtime_app() -> FastAPI:
    """Select the process composition from explicit configuration at startup."""
    if os.getenv("HAUI_COMPASS_SIMULATED_WORKSPACES") == "1":
        # Staging demo: per-account simulated Canvas data behind the web session.
        from haui_compass.api.simulated_workspaces import build_simulated_workspace_app

        return build_simulated_workspace_app()
    return create_app(build_runtime_container())


app = build_runtime_app()
