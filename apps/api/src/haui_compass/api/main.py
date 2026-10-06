from typing import cast

from fastapi import FastAPI

from haui_compass.api.compass_chat import router as compass_router
from haui_compass.api.dependencies import AppContainer, build_container, build_runtime_container
from haui_compass.api.errors import register_error_handlers
from haui_compass.api.v1.routes import container_from_app, router


def create_app(container: AppContainer | None = None) -> FastAPI:
    resolved = container or build_container()
    app = FastAPI(title="HaUI Compass API", version="0.1.0")
    app.state.container = resolved

    def get_container() -> AppContainer:
        return cast(AppContainer, app.state.container)

    app.dependency_overrides[container_from_app] = get_container
    app.include_router(router, prefix="/api/v1")
    app.include_router(compass_router, prefix="/api/v1")
    register_error_handlers(app)
    return app


app = create_app(build_runtime_container())
