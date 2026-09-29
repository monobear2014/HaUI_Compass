from datetime import UTC, datetime, timedelta
from uuid import UUID

from haui_compass.application.academic_import import (
    AcademicSource,
    ImportedAcademicDataProvider,
    dataset_from_values,
)
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.use_cases.create_study_task import (
    CreateStudyTask,
    CreateStudyTaskRequest,
)
from haui_compass.domain.tasks.task import TaskId
from haui_compass.infrastructure.persistence.memory.tasks import InMemoryTaskRepository
from support.clocks import FixedClock


def test_creates_only_the_explicit_requested_task_for_imported_assignment() -> None:
    provider = ImportedAcademicDataProvider()
    provider.replace(
        dataset_from_values(
            student_id="pilot",
            source=AcademicSource.MANUAL,
            courses=(("course", "Databases", None),),
            assignments=(
                ("assignment", "course", "Schema report", datetime(2026, 10, 8, tzinfo=UTC), 90),
            ),
            submissions=(),
        )
    )
    tasks = InMemoryTaskRepository()
    stored = CreateStudyTask(
        lms=provider, tasks=tasks, clock=FixedClock(datetime(2026, 10, 1, tzinfo=UTC))
    ).execute(
        CreateStudyTaskRequest(
            student=ExternalRef("manual", "pilot"),
            assignment=ExternalRef("manual", "assignment"),
            task_id=TaskId(UUID(int=41)),
            title="Draft the schema",
            estimated_duration=timedelta(minutes=45),
        )
    )
    assert stored.task.title == "Draft the schema"
    assert len(tasks.list_for_student(stored.student_id)) == 1
