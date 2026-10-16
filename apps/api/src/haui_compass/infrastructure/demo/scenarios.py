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
    WEEK = "week"
    NORMAL = "normal"
    CRUNCH = "crunch"
    DISRUPTED = "disrupted"


LABELS = {
    ScenarioId.WEEK: "Tuần học mẫu",
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


HANOI_OFFSET = timedelta(hours=7)
DEMO_DAY_START_HOUR = 9


class SteppingDemoClock:
    """Demo-only clock that stands still until the presenter explicitly moves it forward."""

    def __init__(self, instant: datetime = NOW) -> None:
        self.instant = instant

    def now(self) -> datetime:
        return self.instant

    def advance_to_next_day(self) -> None:
        local = self.instant + HANOI_OFFSET
        start = local.replace(hour=DEMO_DAY_START_HOUR, minute=0, second=0, microsecond=0)
        self.instant = start + timedelta(days=1) - HANOI_OFFSET

    def advance_to_next_week(self) -> None:
        local = self.instant + HANOI_OFFSET
        start = local.replace(hour=DEMO_DAY_START_HOUR, minute=0, second=0, microsecond=0)
        self.instant = start + timedelta(days=7 - local.weekday()) - HANOI_OFFSET


@dataclass(frozen=True)
class Scenario:
    id: ScenarioId
    student: ExternalRef
    records: MockStudentRecords
    tasks: tuple[Task, ...]
    period: PlanPeriod
    windows: tuple[StudyWindow, ...]


def _hanoi(anchor: datetime, days: int, hour: int, minute: int = 0) -> datetime:
    """``anchor`` is a Monday 09:00 in Hanoi; return another wall-clock time in that week."""
    return anchor + timedelta(days=days, hours=hour - DEMO_DAY_START_HOUR, minutes=minute)


def week_scenario(anchor: datetime) -> Scenario:
    """Two-week Canvas-like fixture that starts with no plan, so the student plans the week."""
    student = ExternalRef("mock-canvas", "showcase-week")

    def ref(key: str) -> ExternalRef:
        return ExternalRef(student.provider, f"week-{key}")

    courses = tuple(
        LMSCourseRecord(ref=ref(key), name=name, code=code)
        for key, name, code in (
            ("db", "Cơ sở dữ liệu", "IT6035"),
            ("ml", "Học máy", "IT6047"),
            ("cm", "Kỹ năng giao tiếp", "BS6018"),
        )
    )
    # (key, course, title, deadline (day offset, hour), effort minutes, tasks)
    definitions: tuple[tuple[str, str, str, int, int, int, tuple[tuple[str, int], ...]], ...] = (
        (
            "schema",
            "db",
            "Bài tập 1: Thiết kế lược đồ quan hệ",
            2,
            17,
            120,
            (("Vẽ sơ đồ thực thể - liên kết", 60), ("Chuẩn hoá lược đồ về 3NF", 60)),
        ),
        (
            "regression",
            "ml",
            "Lab 2: Hồi quy tuyến tính",
            3,
            17,
            90,
            (("Cài đặt mô hình hồi quy cơ sở", 90),),
        ),
        (
            "outline",
            "cm",
            "Dàn ý bài thuyết trình nhóm",
            4,
            17,
            45,
            (("Viết dàn ý thuyết trình", 45),),
        ),
        (
            "evaluation",
            "ml",
            "Báo cáo đánh giá mô hình",
            8,
            17,
            120,
            (("So sánh các chỉ số đánh giá", 120),),
        ),
        # Large deliverable without tasks: the student breaks it down with AI support.
        ("project", "db", "Đồ án nhỏ: Hệ quản lý thư viện", 11, 17, 180, ()),
    )
    assignments = tuple(
        LMSAssignmentRecord(
            ref=ref(f"assignment-{key}"),
            course_ref=ref(course),
            title=title,
            deadline=_hanoi(anchor, day, hour),
            estimated_effort=timedelta(minutes=effort),
        )
        for key, course, title, day, hour, effort, _ in definitions
    )
    tasks: list[Task] = []
    for index, (*_, items) in enumerate(definitions):
        for title, minutes in items:
            tasks.append(
                Task(
                    id=TaskId(UUID(int=301 + len(tasks))),
                    assignment_id=assignment_id_for(assignments[index].ref),
                    title=title,
                    estimated_duration=timedelta(minutes=minutes),
                )
            )
    windows = tuple(
        StudyWindow(
            starts_at=_hanoi(anchor, day, hour, minute),
            ends_at=_hanoi(anchor, day, hour, minute) + timedelta(minutes=length),
        )
        for day, hour, minute, length in (
            (0, 19, 0, 90),
            (1, 19, 0, 90),
            (2, 14, 0, 90),
            (3, 19, 0, 60),
            (5, 9, 0, 120),
        )
    )
    return Scenario(
        id=ScenarioId.WEEK,
        student=student,
        records=(
            courses,
            assignments,
            tuple(
                LMSSubmissionRecord(assignment_ref=a.ref, status=SubmissionStatus.NOT_SUBMITTED)
                for a in assignments
            ),
        ),
        tasks=tuple(tasks),
        period=PlanPeriod(
            start=anchor.replace(hour=0), end=anchor.replace(hour=0) + timedelta(days=7)
        ),
        windows=windows,
    )


def scenario_data(identifier: ScenarioId, anchor: datetime) -> Scenario:
    if identifier is ScenarioId.WEEK:
        return week_scenario(anchor)
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
