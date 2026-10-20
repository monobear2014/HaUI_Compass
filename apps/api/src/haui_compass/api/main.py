import os

from fastapi import FastAPI

from haui_compass.api.app_factory import create_app
from haui_compass.api.dependencies import build_runtime_container

__all__ = ["app", "build_runtime_app", "create_app"]


def build_runtime_app() -> FastAPI:
    """Select the process composition from explicit configuration at startup."""
    if os.getenv("HAUI_COMPASS_SIMULATED_WORKSPACES") == "1":
        # Staging demo: per-account simulated Canvas data behind the web session.
        from haui_compass.api.simulated_workspaces import build_simulated_workspace_app

        return build_simulated_workspace_app()
    return create_app(build_runtime_container())


app = build_runtime_app()
