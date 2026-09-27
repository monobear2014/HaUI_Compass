"""Deterministic, process-local persistence adapters for development and tests."""

from haui_compass.infrastructure.persistence.memory.executions import (
    InMemoryTaskExecutionRepository,
)
from haui_compass.infrastructure.persistence.memory.reflections import (
    InMemoryConfirmedReflectionRepository,
)
from haui_compass.infrastructure.persistence.memory.study_plans import (
    InMemoryStudyPlanRepository,
)
from haui_compass.infrastructure.persistence.memory.tasks import InMemoryTaskRepository

__all__ = [
    "InMemoryConfirmedReflectionRepository",
    "InMemoryStudyPlanRepository",
    "InMemoryTaskExecutionRepository",
    "InMemoryTaskRepository",
]
