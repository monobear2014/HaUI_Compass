"""Authored, reproducible fixtures. No risk levels or recommendations are seeded."""

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from uuid import UUID

from haui_compass.application.lms_mapping import assignment_id_for
from haui_compass.application.ports.lms import (
    ExternalRef,
    LMSAssignmentRecord,
    LMSCourseRecord,
    LMSSubmissionRecord,
    SubmissionStatus,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.tasks.task import Task, TaskId
from haui_compass.infrastructure.lms.mock_data import MockStudentRecords


class ScenarioId(StrEnum):
    NORMAL = "normal"
    CRUNCH = "crunch"
    DISRUPTED = "disrupted"


LABELS = {
    ScenarioId.NORMAL: "Normal Week",
    ScenarioId.CRUNCH: "Deadline Crunch",
    ScenarioId.DISRUPTED: "Disrupted Week",
}
NOW = datetime(2026, 10, 5, 2, tzinfo=UTC)  # Monday, 09:00 Hanoi


@dataclass(frozen=True)
class DemoClock:
    instant: datetime = NOW

    def now(self) -> datetime:
        return self.instant


@dataclass(frozen=True)
class Scenario:
    id: ScenarioId
    student: ExternalRef
    records: MockStudentRecords
    tasks: tuple[Task, ...]
    period: PlanPeriod
    windows: tuple[StudyWindow, ...]


def scenario_data(identifier: ScenarioId, anchor: datetime) -> Scenario:
    student = ExternalRef("mock-lms", f"showcase-{identifier.value}")

    def ref(key: str) -> ExternalRef:
        return ExternalRef(student.provider, f"{identifier.value}-{key}")

    courses = tuple(
        LMSCourseRecord(ref=ref(key), name=name, code=f"FICTION-{key.upper()}")
        for key, name in (("db", "Databases"), ("ml", "Machine Learning"), ("en", "Communication"))
    )
    efforts = (150, 105, 90, 30) if identifier is ScenarioId.CRUNCH else (45, 60, 90, 30)
    due_hours = (24, 48, 72, 96) if identifier is not ScenarioId.NORMAL else (72, 96, 120, 144)
    definitions = (
        ("db", "Database Schema", "Draft the relational schema"),
        ("ml", "Regression Lab", "Implement the regression baseline"),
        ("ml", "Evaluation Report", "Compare model evaluation metrics"),
        ("en", "Project Presentation", "Outline the presentation"),
    )
    assignments = tuple(
        LMSAssignmentRecord(
            ref=ref(f"assignment-{i}"),
            course_ref=ref(course),
            title=title,
            deadline=anchor + timedelta(hours=due_hours[i]),
            estimated_effort=timedelta(minutes=efforts[i]),
        )
        for i, (course, title, _) in enumerate(definitions)
    )
    # A large fictional deliverable intentionally starts without tasks so v0.3 can demonstrate
    # AI candidates becoming student-confirmed task facts.
    assignments += (
        LMSAssignmentRecord(
            ref=ref("assignment-capstone"),
            course_ref=ref("db"),
            title="Database Mini Project",
            deadline=anchor + timedelta(hours=60),
            estimated_effort=timedelta(minutes=180),
        ),
    )
    tasks = tuple(
        Task(
            id=TaskId(UUID(int=101 + i)),
            assignment_id=assignment_id_for(assignments[i].ref),
            title=title,
            estimated_duration=timedelta(minutes=efforts[i]),
        )
        for i, (_, _, title) in enumerate(definitions)
    )
    lengths = {
        ScenarioId.NORMAL: (180, 120, 120),
        ScenarioId.CRUNCH: (60, 60, 60),
        ScenarioId.DISRUPTED: (90, 90, 90),
    }[identifier]
    windows = tuple(
        StudyWindow(
            starts_at=anchor + timedelta(hours=1 + i * 24),
            ends_at=anchor + timedelta(hours=1 + i * 24, minutes=length),
        )
        for i, length in enumerate(lengths)
    )
    return Scenario(
        id=identifier,
        student=student,
        records=(
            courses,
            assignments,
            tuple(
                LMSSubmissionRecord(assignment_ref=a.ref, status=SubmissionStatus.NOT_SUBMITTED)
                for a in assignments
            ),
        ),
        tasks=tasks,
        period=PlanPeriod(
            start=anchor.replace(hour=0), end=anchor.replace(hour=0) + timedelta(days=7)
        ),
        windows=windows,
    )
