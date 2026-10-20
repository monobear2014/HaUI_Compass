"""Read-only aggregates over explicitly rostered simulated accounts, never reflection text."""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Protocol

from haui_compass.api.dependencies import AppContainer
from haui_compass.application.lms_mapping import student_id_for
from haui_compass.application.ports.simulated_submissions import SimulatedAssignmentCatalogEntry
from haui_compass.application.ports.simulated_workspaces import SimulatedWorkspace
from haui_compass.domain.lecturer import submission_progress


class WorkspaceReader(Protocol):
    def get(self, owner: str) -> SimulatedWorkspace | None: ...
    def assignment_catalog(
        self, space: SimulatedWorkspace
    ) -> tuple[SimulatedAssignmentCatalogEntry, ...]: ...
    def submission_rows(
        self, space: SimulatedWorkspace
    ) -> tuple[
        tuple[tuple[datetime | None, datetime | None], ...],
        tuple[tuple[datetime | None, datetime | None], ...],
    ]: ...


def activity_summary(
    owners: Sequence[str], container: AppContainer, workspaces: WorkspaceReader
) -> tuple[int, dict[str, int], dict[str, object], dict[str, object]]:
    # Do not initialize student workspaces from a lecturer GET. Only current generations
    # count, so retired/reset tasks cannot inflate the dashboard.
    spaces = [space for owner in owners if (space := workspaces.get(owner)) is not None]

    def combine(rows: list[dict[str, object]]) -> dict[str, object]:
        counts = {
            key: sum(value for row in rows if isinstance((value := row[key]), int))
            for key in (
                "on_time",
                "late",
                "not_submitted",
                "not_yet_due",
                "no_deadline",
                "due_obligations",
                "on_time_due",
            )
        }
        return {
            **counts,
            "on_time_rate": round(counts["on_time_due"] / counts["due_obligations"] * 100, 1)
            if counts["due_obligations"]
            else None,
        }

    before_rows: list[dict[str, object]] = []
    after_rows: list[dict[str, object]] = []

    def collect() -> dict[str, int]:
        result = dict(
            tasks=0, completed_tasks=0, study_minutes=0, learners_with_plan=0, learners_reflected=0
        )
        total_seconds = 0.0
        for space in spaces:
            before, after = workspaces.submission_rows(space)
            before_rows.append(submission_progress(before, as_of=space.now))
            after_rows.append(submission_progress(after, as_of=space.now))
            student = student_id_for(space.student)
            tasks = container.task_repository.list_for_student(student)
            result["tasks"] += len(tasks)
            result["completed_tasks"] += sum(t.task.status.value == "completed" for t in tasks)
            seconds = sum(
                row.execution.actual_duration.total_seconds()
                for task in tasks
                for row in container.execution_repository.list_for_task(student, task.task.id)
            )
            total_seconds += seconds
            result["learners_with_plan"] += bool(
                container.weekly_goal_repository.list_for_student(student)
            )
            result["learners_reflected"] += bool(
                container.reflection_repository.list_for_student(student)
            )
        result["study_minutes"] = int(total_seconds // 60)
        return result

    activity = container.transaction_manager.run(collect)
    before_summary, after_summary = combine(before_rows), combine(after_rows)
    before_rate, after_rate = before_summary["on_time_rate"], after_summary["on_time_rate"]
    comparison: dict[str, object] = {
        "simulated": True,
        "before_label": "Trước sử dụng · lịch sử giả lập",
        "after_label": "Sau sử dụng · nộp bài mô phỏng",
        "before": before_summary,
        "after": after_summary,
        "change_percentage_points": round(after_rate - before_rate, 1)
        if isinstance(before_rate, (int, float)) and isinstance(after_rate, (int, float))
        else None,
    }
    return len(spaces), activity, after_summary, comparison


@dataclass
class AssignmentAggregate:
    key: str
    title: str
    course: str
    observations: list[dict[str, object]] = field(default_factory=list)
    deadlines: list[datetime] = field(default_factory=list)
    due_soon: int = 0
    tasks: int = 0
    completed_tasks: int = 0
    study_seconds: float = 0


def class_insights(
    owners: Sequence[str], container: AppContainer, workspaces: WorkspaceReader, *, minimum: int
) -> dict[str, object] | None:
    """An aggregate-only assignment drilldown over a fixed, authorized mock roster.

    Never return learner IDs, per-learner rows, private task titles, goals or signals.
    Missing/approaching submission counts are observable facts, not predicted grades.
    """

    def collect() -> dict[str, object] | None:
        spaces = [space for owner in owners if (space := workspaces.get(owner)) is not None]
        if len(spaces) < minimum:
            return None
        groups: dict[str, AssignmentAggregate] = {}
        learners_overdue = learners_due_soon = learners_without_plan = 0
        for space in spaces:
            _, submissions = workspaces.submission_rows(space)
            catalog = workspaces.assignment_catalog(space)
            student = student_id_for(space.student)
            tasks = container.task_repository.list_for_student(student)
            learner_overdue = learner_soon = False
            for entry, (due, submitted) in zip(catalog, submissions, strict=True):
                group = groups.setdefault(
                    entry.key, AssignmentAggregate(entry.key, entry.title, entry.course)
                )
                progress = submission_progress(((due, submitted),), as_of=space.now)
                group.observations.append(progress)
                if due is not None:
                    group.deadlines.append(due)
                    unsubmitted = submitted is None or submitted > space.now
                    soon = unsubmitted and space.now < due <= space.now + timedelta(hours=48)
                    overdue = unsubmitted and due <= space.now
                    group.due_soon += int(soon)
                    learner_overdue |= overdue
                    learner_soon |= soon
                related = [
                    row.task for row in tasks if row.task.assignment_id == entry.assignment_id
                ]
                group.tasks += len(related)
                group.completed_tasks += sum(task.status.value == "completed" for task in related)
                group.study_seconds += sum(
                    execution.execution.actual_duration.total_seconds()
                    for task in related
                    for execution in container.execution_repository.list_for_task(student, task.id)
                )
            learners_overdue += int(learner_overdue)
            learners_due_soon += int(learner_soon)
            learners_without_plan += not bool(
                container.weekly_goal_repository.list_for_student(student)
            )
        assignments: list[dict[str, object]] = []
        for group in groups.values():
            counts = {
                key: sum(
                    value for row in group.observations if isinstance((value := row[key]), int)
                )
                for key in (
                    "on_time",
                    "late",
                    "not_submitted",
                    "not_yet_due",
                    "due_obligations",
                    "on_time_due",
                    "no_deadline",
                )
            }
            assignments.append(
                {
                    "key": group.key,
                    "title": group.title,
                    "course": group.course,
                    "deadline_start": min(group.deadlines) if group.deadlines else None,
                    "deadline_end": max(group.deadlines) if group.deadlines else None,
                    "progress": {
                        **counts,
                        "on_time_rate": round(
                            counts["on_time_due"] / counts["due_obligations"] * 100, 1
                        )
                        if counts["due_obligations"]
                        else None,
                    },
                    "due_soon": group.due_soon,
                    "tasks": group.tasks,
                    "completed_tasks": group.completed_tasks,
                    "study_minutes": int(group.study_seconds // 60),
                }
            )
        return {
            "enrollment_count": len(spaces),
            "assignments": assignments,
            "support": {
                "learners_overdue": learners_overdue,
                "learners_due_soon": learners_due_soon,
                "learners_without_plan": learners_without_plan,
            },
        }

    return container.transaction_manager.run(collect)
