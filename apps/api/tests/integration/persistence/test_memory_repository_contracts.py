from haui_compass.application.ports.executions import TaskExecutionRepository
from haui_compass.application.ports.reflections import ConfirmedReflectionRepository
from haui_compass.application.ports.study_plans import StudyPlanRepository
from haui_compass.application.ports.tasks import TaskRepository
from haui_compass.infrastructure.persistence.memory import (
    InMemoryConfirmedReflectionRepository,
    InMemoryStudyPlanRepository,
    InMemoryTaskExecutionRepository,
    InMemoryTaskRepository,
)
from support.persistence_contracts import (
    assert_execution_repository_contract,
    assert_reflection_repository_contract,
    assert_study_plan_repository_contract,
    assert_task_repository_contract,
)


def task_repository() -> TaskRepository:
    return InMemoryTaskRepository()


def execution_repository() -> TaskExecutionRepository:
    return InMemoryTaskExecutionRepository()


def reflection_repository() -> ConfirmedReflectionRepository:
    return InMemoryConfirmedReflectionRepository()


def study_plan_repository() -> StudyPlanRepository:
    return InMemoryStudyPlanRepository()


def test_task_repository_contract() -> None:
    assert_task_repository_contract(task_repository)


def test_execution_repository_contract() -> None:
    assert_execution_repository_contract(execution_repository)


def test_reflection_repository_contract() -> None:
    assert_reflection_repository_contract(reflection_repository)


def test_study_plan_repository_contract() -> None:
    assert_study_plan_repository_contract(study_plan_repository)
