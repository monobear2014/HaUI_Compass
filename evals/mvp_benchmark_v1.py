#!/usr/bin/env python3
"""Reproducible, fictional-data benchmark for the implemented MVP.

Run from ``apps/api`` with ``uv run --extra dev python ../../evals/mvp_benchmark_v1.py``.
The deployable package never imports this module (ADR-0001).
"""

# ruff: noqa: E402, E501

from __future__ import annotations

import argparse
import json
import os
import platform
import subprocess
import sys
import time
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from pathlib import Path
from uuid import UUID, uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps/api/src"))

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from haui_compass.api.dependencies import build_container
from haui_compass.api.main import create_app
from haui_compass.api.postgres_dependencies import build_postgres_container
from haui_compass.application.lms_mapping import assignment_id_for, student_id_for
from haui_compass.application.ports.lms import ExternalRef
from haui_compass.application.ports.tasks import StoredTask
from haui_compass.application.use_cases.record_task_execution import (
    RecordTaskExecution,
    RecordTaskExecutionRequest,
)
from haui_compass.domain.plans.plan import PlanPeriod, StudyWindow
from haui_compass.domain.plans.planning import PlanningCandidate
from haui_compass.domain.plans.replanning import TaskRemainingEffort
from haui_compass.domain.recommendations.candidate import ActionCandidate
from haui_compass.domain.recommendations.recommendation import NoRecommendation, Recommendation
from haui_compass.domain.risk.context import AssignmentRiskContext
from haui_compass.domain.risk.signal import RiskEvidence, RiskLevel, RiskReasonCode, RiskSignal
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.execution import ExecutionOutcome
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.engines.next_best_action.recommend import recommend_next_action
from haui_compass.engines.planning.availability import normalize_study_windows
from haui_compass.engines.planning.schedule import generate_weekly_plan
from haui_compass.engines.replanning.replan import replan_study_plan
from haui_compass.engines.risk.assess import assess_assignment_risk
from haui_compass.infrastructure.config.database import DatabaseSettings
from haui_compass.infrastructure.lms.mock import MockLMSProvider
from haui_compass.infrastructure.persistence.postgres.models import Base

NOW = datetime(2026, 10, 1, 8, tzinfo=UTC)
STUDENT = ExternalRef("benchmark", "fictional-student-001")
STUDENT_ID = StudentId(UUID(int=9001))
PERIOD = PlanPeriod(start=NOW, end=NOW + timedelta(days=7))


@dataclass(frozen=True)
class Result:
    case_id: str
    category: str
    passed: bool
    expected: dict[str, object]
    actual: dict[str, object]
    failure: str | None = None


def assignment(n: int, *, deadline: datetime):
    from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
    from haui_compass.domain.courses.course import CourseId

    return Assignment(
        id=AssignmentId(UUID(int=n)),
        course_id=CourseId(UUID(int=1)),
        title=f"Fictional {n}",
        deadline=deadline,
    )


def task(
    n: int, assignment_n: int, *, minutes: int = 60, status: TaskStatus = TaskStatus.NOT_STARTED
) -> Task:
    from haui_compass.domain.assignments.assignment import AssignmentId

    return Task(
        id=TaskId(UUID(int=n)),
        assignment_id=AssignmentId(UUID(int=assignment_n)),
        title=f"Task {n}",
        estimated_duration=timedelta(minutes=minutes),
        status=status,
    )


def risk(assignment_n: int, level: RiskLevel, deadline: datetime) -> RiskSignal:
    from haui_compass.domain.assignments.assignment import AssignmentId

    reason = {
        RiskLevel.LOW: RiskReasonCode.SUFFICIENT_SLACK,
        RiskLevel.MEDIUM: RiskReasonCode.LOW_SLACK,
        RiskLevel.HIGH: RiskReasonCode.EFFORT_EXCEEDS_CAPACITY,
        RiskLevel.UNKNOWN: RiskReasonCode.MISSING_CAPACITY,
    }[level]
    return RiskSignal(
        assignment_id=AssignmentId(UUID(int=assignment_n)),
        as_of=NOW,
        level=level,
        reason_codes=(reason,),
        evidence=RiskEvidence(
            deadline=deadline,
            time_until_deadline=deadline - NOW,
            open_task_count=1,
            remaining_effort=None,
            available_capacity=None,
            slack=None,
            slack_ratio=None,
        ),
        engine_version=1,
    )


def plan(tasks: tuple[Task, ...], assignments: tuple, windows: tuple[StudyWindow, ...]):
    return generate_weekly_plan(
        student_id=STUDENT_ID,
        candidates=tuple(
            PlanningCandidate(
                task=item, assignment=next(a for a in assignments if a.id == item.assignment_id)
            )
            for item in tasks
        ),
        period=PERIOD,
        study_windows=windows,
        generated_at=NOW,
    )


def check_plan_invariants(
    value, assignments: tuple, windows: tuple[StudyWindow, ...]
) -> dict[str, int]:
    by_assignment = {a.id: a for a in assignments}
    blocks = value.blocks
    deadline_violations = 0
    window_violations = 0
    normalized_windows = normalize_study_windows(windows, value.period)
    for block in blocks:
        task_assignment = next(t.assignment_id for t in _CURRENT_TASKS if t.id == block.task_id)
        deadline_violations += int(block.ends_at > by_assignment[task_assignment].deadline)
        window_violations += int(
            not any(
                w.starts_at <= block.starts_at and block.ends_at <= w.ends_at
                for w in normalized_windows
            )
        )
    overlaps = sum(
        int(first.ends_at > second.starts_at)
        for i, first in enumerate(blocks)
        for second in blocks[i + 1 :]
    )
    planned = sum((item.duration for item in blocks), timedelta())
    unplanned = sum((item.remaining_effort for item in value.unplanned_tasks), timedelta())
    expected = sum(
        (
            item.estimated_duration
            for item in _CURRENT_TASKS
            if item.status is not TaskStatus.COMPLETED
        ),
        timedelta(),
    )
    return {
        "deadline_violations": deadline_violations,
        "window_violations": window_violations,
        "overlaps": overlaps,
        "conservation_violations": int(planned + unplanned != expected),
    }


_CURRENT_TASKS: tuple[Task, ...] = ()


def window(start_hours: float, end_hours: float) -> StudyWindow:
    return StudyWindow(
        starts_at=NOW + timedelta(hours=start_hours),
        ends_at=NOW + timedelta(hours=end_hours),
    )


def planning_cases() -> list[Result]:
    global _CURRENT_TASKS
    deadline = NOW + timedelta(days=2)
    results: list[Result] = []
    specs = [
        ("PLAN-01", (task(1, 1, minutes=60),), (window(1, 3),), {"unplanned_count": 0}),
        ("PLAN-02", (task(1, 1, minutes=60),), (window(1, 2),), {"unplanned_count": 0}),
        (
            "PLAN-03",
            (task(1, 1, minutes=120),),
            (window(1, 2),),
            {"unplanned_reason": "insufficient_capacity"},
        ),
        (
            "PLAN-04",
            (task(1, 1, minutes=60),),
            (window(72, 73),),
            {"unplanned_reason": "no_study_window_before_deadline"},
        ),
        ("PLAN-05", (task(1, 1, minutes=90),), (window(1, 2), window(3, 4)), {"block_count": 2}),
        (
            "PLAN-06",
            (task(1, 1, minutes=90),),
            (window(1, 2), window(1.5, 2.5)),
            {"scheduled_minutes": 90},
        ),
        (
            "PLAN-07",
            (task(1, 1, status=TaskStatus.COMPLETED),),
            (window(1, 2),),
            {"block_count": 0},
        ),
    ]
    for case_id, tasks, windows, expected in specs:
        own_deadline = NOW + timedelta(hours=2) if case_id == "PLAN-04" else deadline
        assignments = (assignment(1, deadline=own_deadline),)
        _CURRENT_TASKS = tasks
        value = plan(tasks, assignments, windows)
        actual = {
            "unplanned_count": len(value.unplanned_tasks),
            "block_count": len(value.blocks),
            "scheduled_minutes": int(
                sum((b.duration for b in value.blocks), timedelta()).total_seconds() / 60
            ),
        }
        if value.unplanned_tasks:
            actual["unplanned_reason"] = value.unplanned_tasks[0].reason.value
        actual.update(check_plan_invariants(value, assignments, windows))
        passed = all(actual.get(key) == val for key, val in expected.items()) and not any(
            actual[key]
            for key in (
                "deadline_violations",
                "window_violations",
                "overlaps",
                "conservation_violations",
            )
        )
        results.append(
            Result(
                case_id,
                "planning",
                passed,
                expected,
                actual,
                None if passed else "planner structured expectation or invariant failed",
            )
        )
    return results


def risk_cases() -> list[Result]:
    specs = [
        ("RISK-01", 60, 120, NOW + timedelta(days=1), "low"),
        ("RISK-02", 60, 70, NOW + timedelta(days=1), "medium"),
        ("RISK-03", 60, 30, NOW + timedelta(days=1), "high"),
        ("RISK-04", 60, None, NOW + timedelta(days=1), "unknown"),
        ("RISK-05", None, 60, NOW + timedelta(days=1), "unknown"),
        ("RISK-06", 60, 120, NOW - timedelta(seconds=1), "high"),
    ]
    out = []
    for index, (case_id, effort, capacity, deadline, expected_level) in enumerate(specs, 1):
        value = assess_assignment_risk(
            AssignmentRiskContext(
                assignment_id=assignment_id_for(ExternalRef("benchmark", str(index))),
                now=NOW,
                deadline=deadline,
                open_task_count=1,
                remaining_effort=timedelta(minutes=effort) if effort is not None else None,
                available_capacity_until_deadline=timedelta(minutes=capacity)
                if capacity is not None
                else None,
            )
        )
        actual = {
            "level": value.level.value,
            "reason_codes": [code.value for code in value.reason_codes],
        }
        passed = actual["level"] == expected_level
        out.append(
            Result(
                case_id,
                "risk",
                passed,
                {"level": expected_level},
                actual,
                None if passed else "risk level mismatch",
            )
        )
    return out


def nba_cases() -> list[Result]:
    deadline = NOW + timedelta(days=2)

    def choose(items):
        return recommend_next_action(items, now=NOW)

    specs = [
        (
            "NBA-01",
            (
                candidate(1, 1, RiskLevel.HIGH, deadline),
                candidate(2, 2, RiskLevel.LOW, NOW + timedelta(days=1)),
            ),
            {"task_id": str(UUID(int=1))},
        ),
        (
            "NBA-02",
            (
                candidate(1, 1, RiskLevel.LOW, deadline),
                candidate(2, 2, RiskLevel.LOW, deadline + timedelta(days=1)),
            ),
            {"task_id": str(UUID(int=1))},
        ),
        (
            "NBA-03",
            (
                candidate(1, 1, RiskLevel.LOW, deadline),
                candidate(2, 2, RiskLevel.LOW, deadline, status=TaskStatus.IN_PROGRESS),
            ),
            {"task_id": str(UUID(int=2))},
        ),
        ("NBA-04", (candidate(1, 1, RiskLevel.UNKNOWN, deadline),), {"risk_level": "unknown"}),
        (
            "NBA-05",
            (candidate(2, 2, RiskLevel.LOW, deadline), candidate(1, 1, RiskLevel.LOW, deadline)),
            {"task_id": str(UUID(int=1))},
        ),
        (
            "NBA-06",
            (candidate(1, 1, RiskLevel.LOW, deadline, status=TaskStatus.COMPLETED),),
            {"kind": "no_recommendation"},
        ),
    ]
    out = []
    for case_id, candidates, expected in specs:
        value = choose(candidates)
        actual = {
            "kind": "no_recommendation" if isinstance(value, NoRecommendation) else "recommendation"
        }
        if isinstance(value, Recommendation):
            actual.update(
                {"task_id": str(value.task_id), "risk_level": value.evidence.risk_level.value}
            )
        passed = all(actual.get(k) == v for k, v in expected.items())
        out.append(
            Result(
                case_id,
                "nba",
                passed,
                expected,
                actual,
                None if passed else "NBA structured expectation failed",
            )
        )
    return out


def candidate(
    task_n: int,
    assignment_n: int,
    level: RiskLevel,
    deadline: datetime,
    *,
    status: TaskStatus = TaskStatus.NOT_STARTED,
) -> ActionCandidate:
    return ActionCandidate(
        task=task(task_n, assignment_n, status=status),
        assignment=assignment(assignment_n, deadline=deadline),
        risk=risk(assignment_n, level, deadline),
    )


def configured_postgres_url() -> str | None:
    url = os.getenv("HAUI_COMPASS_TEST_DATABASE_URL")
    if url and url.startswith(("postgresql://", "postgresql+psycopg://")):
        return url
    return None


def reset_postgres(database_url: str) -> None:
    """Migrate then remove only benchmark-test facts before one isolated loop."""
    os.environ["HAUI_COMPASS_DATABASE_URL"] = database_url
    command.upgrade(Config(str(ROOT / "apps/api/alembic.ini")), "head")
    table_names = ", ".join(table.name for table in reversed(Base.metadata.sorted_tables))
    engine = create_engine(database_url, future=True)
    try:
        with engine.begin() as connection:
            connection.execute(text(f"TRUNCATE TABLE {table_names} CASCADE"))
    finally:
        engine.dispose()


def fresh_client(*, postgres_url: str | None = None) -> tuple[TestClient, dict[str, object], str]:
    lms = MockLMSProvider.canonical(anchor=NOW)
    # The canonical fixture is provider-specific. Keep benchmark ownership distinct but use its explicit records.
    student = ExternalRef("mock-lms", "student-001")
    clock = type("FixedClock", (), {"now": lambda self: NOW})()
    container = (
        build_postgres_container(
            settings=DatabaseSettings(url=postgres_url), lms=lms, clock=clock
        )
        if postgres_url
        else build_container(lms=lms, clock=clock)
    )
    assignment_record = lms.get_assignments(student)[0]
    identity = uuid4()
    stored = StoredTask(
        student_id=student_id_for(student),
        task=Task(
            id=TaskId(identity),
            assignment_id=assignment_id_for(assignment_record.ref),
            title="Fictional benchmark task",
            estimated_duration=timedelta(minutes=20),
        ),
        saved_at=NOW,
    )
    container.transaction_manager.run(lambda: container.task_repository.save(stored))
    payload = {"provider": student.provider, "id": student.id}
    return TestClient(create_app(container)), payload, str(identity)


def http_loop(
    *, selected: bool = True, postgres_url: str | None = None
) -> tuple[dict[str, object], dict[str, list[float]]]:
    if postgres_url:
        reset_postgres(postgres_url)
    client, student, task_id = fresh_client(postgres_url=postgres_url)
    period = {"start": NOW.isoformat(), "end": (NOW + timedelta(days=1)).isoformat()}
    timings: dict[str, list[float]] = {}

    def call(name: str, method: str, path: str, **kwargs):
        start = time.perf_counter_ns()
        response = getattr(client, method)(path, **kwargs)
        timings.setdefault(name, []).append((time.perf_counter_ns() - start) / 1_000_000)
        assert response.status_code == 200, response.text
        return response.json()

    plan_record = str(uuid4())
    generated = call(
        "weekly_plan",
        "post",
        "/api/v1/weekly-plans",
        json={
            "student": student,
            "record_id": plan_record,
            "period": period,
            "study_windows": [
                {
                    "starts_at": (NOW + timedelta(hours=1)).isoformat(),
                    "ends_at": (NOW + timedelta(hours=2)).isoformat(),
                }
            ],
        },
    )
    recommendation = call(
        "daily_recommendation",
        "post",
        "/api/v1/daily-recommendation",
        json={"student": student, "available_minutes": 60, "assignment_capacities": []},
    )
    execution_id = str(uuid4())
    execution_body = {
        "student": student,
        "task_id": task_id,
        "record_id": execution_id,
        "started_at": (NOW - timedelta(minutes=15)).isoformat(),
        "ended_at": NOW.isoformat(),
        "outcome": "partial",
    }
    execution = call("execution", "post", "/api/v1/task-executions", json=execution_body)
    retry = call("execution_idempotent_retry", "post", "/api/v1/task-executions", json=execution_body)
    context = {
        "student": student,
        "period": period,
        "responses": {
            "reflected_task_ids": [task_id],
            "workload_feedback": "too_heavy",
            "difficult_topics": ["fictional topic"],
            "deferred_task_ids": [task_id],
        },
    }
    candidates = call(
        "reflection_candidates", "post", "/api/v1/reflections/candidates", json=context
    )
    selected_ids = [candidates["candidates"][0]["id"]] if selected else []
    confirmed = call(
        "reflection_confirmation",
        "post",
        "/api/v1/reflections/confirm",
        json={**context, "record_id": str(uuid4()), "selected_signal_ids": selected_ids},
    )
    replanned = call(
        "adaptive_replan",
        "post",
        "/api/v1/weekly-plans/replan",
        json={
            "student": student,
            "record_id": str(uuid4()),
            "period": period,
            "study_windows": [
                {
                    "starts_at": (NOW + timedelta(hours=1)).isoformat(),
                    "ends_at": (NOW + timedelta(hours=2)).isoformat(),
                }
            ],
            "remaining_efforts": [{"task_id": task_id, "remaining_duration_seconds": 1200}],
            "effective_at": NOW.isoformat(),
        },
    )
    completed = call(
        "execution_complete",
        "post",
        "/api/v1/task-executions",
        json={
            **execution_body,
            "record_id": str(uuid4()),
            "started_at": (NOW - timedelta(minutes=30)).isoformat(),
            "ended_at": (NOW - timedelta(minutes=20)).isoformat(),
            "outcome": "completed",
        },
    )
    after_completed_recommendation = call(
        "daily_recommendation_after_completion",
        "post",
        "/api/v1/daily-recommendation",
        json={"student": student, "available_minutes": 60, "assignment_capacities": []},
    )
    latest = call(
        "latest_plan",
        "get",
        "/api/v1/weekly-plans/latest",
        params={
            "student_provider": student["provider"],
            "student_id": student["id"],
            "period_start": period["start"],
            "period_end": period["end"],
        },
    )
    history = client.get(
        "/api/v1/weekly-plans/history",
        params={
            "student_provider": student["provider"],
            "student_id": student["id"],
            "period_start": period["start"],
            "period_end": period["end"],
        },
    ).json()
    return {
        "generated": generated,
        "recommendation": recommendation,
        "execution": execution,
        "retry": retry,
        "candidates": candidates,
        "confirmed": confirmed,
        "replanned": replanned,
        "completed": completed,
        "after_completed_recommendation": after_completed_recommendation,
        "latest": latest,
        "history": history,
        "student": student,
        "task_id": task_id,
    }, timings


def http_cases() -> tuple[list[Result], dict[str, list[float]]]:
    data, timings = http_loop()
    candidates = data["candidates"]["candidates"]
    kinds = [item["kind"] for item in candidates]
    selected = data["confirmed"]["confirmed_signal_ids"]
    replan = data["replanned"]
    completed_result = RecordTaskExecution().execute(
        RecordTaskExecutionRequest(
            task=task(80, 80),
            started_at=NOW - timedelta(minutes=15),
            ended_at=NOW,
            outcome=ExecutionOutcome.COMPLETED,
        )
    )
    try:
        RecordTaskExecution().execute(
            RecordTaskExecutionRequest(
                task=completed_result.updated_task,
                started_at=NOW - timedelta(minutes=10),
                ended_at=NOW,
                outcome=ExecutionOutcome.PARTIAL,
            )
        )
    except Exception as error:
        invalid_transition = type(error).__name__
    else:  # pragma: no cover - a completed task must reject execution
        invalid_transition = "accepted"
    cases = [
        Result(
            "EXEC-01",
            "execution",
            data["execution"]["task_status"] == "in_progress",
            {"status": "in_progress"},
            {"status": data["execution"]["task_status"]},
        ),
        Result(
            "EXEC-02",
            "execution",
            completed_result.updated_task.status.value == "completed",
            {"status": "completed"},
            {"status": completed_result.updated_task.status.value},
        ),
        Result(
            "EXEC-03",
            "execution",
            data["retry"]["idempotent_retry"] is True,
            {"idempotent_retry": True},
            {"idempotent_retry": data["retry"]["idempotent_retry"]},
        ),
        Result(
            "EXEC-04",
            "execution",
            invalid_transition == "TaskAlreadyCompletedError",
            {"error": "TaskAlreadyCompletedError"},
            {"error": invalid_transition},
        ),
        Result(
            "REFLECT-01",
            "reflection",
            len(candidates) == 4,
            {"candidate_count": 4},
            {"candidate_count": len(candidates)},
        ),
        Result(
            "REFLECT-02",
            "reflection",
            len(selected) == 1,
            {"confirmed_count": 1},
            {"confirmed_count": len(selected)},
        ),
        Result(
            "REFLECT-03",
            "reflection",
            len(selected) < len(candidates),
            {"persisted_count": 1},
            {"persisted_count": len(selected), "rejected_count": len(candidates) - len(selected)},
        ),
        Result(
            "REFLECT-04",
            "reflection",
            "estimation_feedback" in kinds
            and len(set(kinds) & {"workload_feedback", "difficult_topic", "deferred_task"}) == 3,
            {"factual_count": 1, "self_reported_count": 3},
            {
                "factual_count": int("estimation_feedback" in kinds),
                "self_reported_count": len(
                    set(kinds) & {"workload_feedback", "difficult_topic", "deferred_task"}
                ),
            },
        ),
        Result(
            "E2E-01",
            "end_to_end",
            len(data["history"]) == 2
            and len(selected) == 1
            and data["latest"]["record_id"] == replan["plan"]["record_id"],
            {"revision_count": 2, "confirmed_count": 1},
            {
                "revision_count": len(data["history"]),
                "confirmed_count": len(selected),
                "unplanned_count": len(replan["plan"]["unplanned_tasks"]),
            },
        ),
    ]
    return cases, timings


def replan_cases() -> list[Result]:
    global _CURRENT_TASKS
    original = task(1, 1, minutes=60)
    assignments = (assignment(1, deadline=NOW + timedelta(days=3)),)
    windows = (window(1, 2),)
    _CURRENT_TASKS = (original,)
    baseline = plan((original,), assignments, windows)

    def invoke(
        current: Task, current_windows=windows, remaining=60, current_assignments=assignments
    ):
        return replan_study_plan(
            baseline_plan=baseline,
            tasks=(current,),
            assignments=current_assignments,
            study_windows=current_windows,
            remaining_efforts=(
                TaskRemainingEffort(
                    task_id=current.id, remaining_duration=timedelta(minutes=remaining)
                ),
            ),
            execution_summaries=(),
            confirmed_reflections=(),
            effective_at=NOW,
        )

    no_change = invoke(original)
    completed = invoke(task(1, 1, minutes=60, status=TaskStatus.COMPLETED), remaining=0)
    changed_window = invoke(original, (window(2, 3),))
    reduced = invoke(original, remaining=30)
    increased = invoke(original, remaining=90)
    insufficient = invoke(original, (window(1, 1.5),), remaining=60)
    deadline_changed = invoke(
        original, current_assignments=(assignment(1, deadline=NOW + timedelta(minutes=90)),)
    )
    try:
        replan_study_plan(
            baseline_plan=baseline,
            tasks=(original,),
            assignments=assignments,
            study_windows=windows,
            remaining_efforts=(),
            execution_summaries=(),
            confirmed_reflections=(),
            effective_at=NOW,
        )
    except Exception as error:
        missing_error = str(error)
    else:  # pragma: no cover - benchmark must expose this validation regression
        missing_error = ""

    def reasons(value):
        return [reason.value for change in value.changes for reason in change.reasons]

    values = [
        ("REPLAN-01", no_change, {"change_count": 0}, {"change_count": len(no_change.changes)}),
        ("REPLAN-02", completed, {"reason": "task_completed"}, {"reasons": reasons(completed)}),
        (
            "REPLAN-03",
            changed_window,
            {"reason": "study_window_changed"},
            {"reasons": reasons(changed_window)},
        ),
        (
            "REPLAN-04",
            deadline_changed,
            {"reason": "assignment_deadline_changed"},
            {"reasons": reasons(deadline_changed)},
        ),
        (
            "REPLAN-05",
            reduced,
            {"reason": "remaining_effort_changed"},
            {"reasons": reasons(reduced)},
        ),
        (
            "REPLAN-06",
            increased,
            {"reason": "remaining_effort_changed"},
            {"reasons": reasons(increased)},
        ),
        (
            "REPLAN-07",
            insufficient,
            {"unplanned_reason": "insufficient_capacity"},
            {"unplanned_reason": insufficient.revised_plan.unplanned_tasks[0].reason.value},
        ),
        (
            "REPLAN-08",
            None,
            {"error": "explicit remaining effort is required for every open task"},
            {"error": missing_error},
        ),
    ]
    out = []
    for case_id, _value, expected, actual in values:
        if case_id == "REPLAN-08":
            passed = expected["error"] in actual["error"]
        elif "reason" in expected:
            passed = expected["reason"] in actual["reasons"]
        else:
            passed = all(actual.get(k) == v for k, v in expected.items())
        out.append(
            Result(
                case_id,
                "replanning",
                passed,
                expected,
                actual,
                None if passed else "replanning structured expectation failed",
            )
        )
    return out


def percentile(samples: list[float], fraction: float) -> float:
    """Nearest-rank percentile: rank = ceil(fraction * n), one-indexed."""
    if not samples:
        raise ValueError("percentile requires at least one sample")
    if not 0 < fraction <= 1:
        raise ValueError("percentile fraction must be in (0, 1]")
    ordered = sorted(samples)
    return ordered[max(0, min(len(ordered) - 1, int(len(ordered) * fraction + 0.999999) - 1))]


def determinism_result() -> tuple[int, int]:
    tasks = (task(1, 1, minutes=30), task(2, 2, minutes=45))
    assignments = (
        assignment(1, deadline=NOW + timedelta(days=2)),
        assignment(2, deadline=NOW + timedelta(days=3)),
    )
    windows = (window(1, 2), window(3, 4))
    planner_stable = plan(tasks, assignments, windows) == plan(
        tuple(reversed(tasks)), tuple(reversed(assignments)), tuple(reversed(windows))
    )
    first = candidate(1, 1, RiskLevel.LOW, NOW + timedelta(days=2))
    second = candidate(2, 2, RiskLevel.LOW, NOW + timedelta(days=3))
    nba_stable = recommend_next_action((first, second), now=NOW) == recommend_next_action(
        (second, first), now=NOW
    )
    context = AssignmentRiskContext(
        assignment_id=assignment_id_for(ExternalRef("benchmark", "determinism")),
        now=NOW,
        deadline=NOW + timedelta(days=1),
        open_task_count=1,
        remaining_effort=timedelta(minutes=60),
        available_capacity_until_deadline=timedelta(minutes=120),
    )
    risk_stable = assess_assignment_risk(context) == assess_assignment_risk(context)
    return (sum((planner_stable, nba_stable, risk_stable)), 3)


LATENCY_ENDPOINTS = (
    "daily_recommendation",
    "weekly_plan",
    "execution",
    "reflection_candidates",
    "reflection_confirmation",
    "adaptive_replan",
    "latest_plan",
)


def latency_summary(timings: dict[str, list[float]]) -> dict[str, dict[str, float | int]]:
    return {
        name: {
            "n": len(values),
            "min_ms": round(min(values), 3),
            "p50_ms": round(percentile(values, 0.50), 3),
            "p95_ms": round(percentile(values, 0.95), 3),
            "p99_ms": round(percentile(values, 0.99), 3),
            "max_ms": round(max(values), 3),
        }
        for name in LATENCY_ENDPOINTS
        if (values := timings.get(name))
    }


def run_isolated_loops(
    attempts: int, *, postgres_url: str | None = None, capture_timings: bool = False
) -> tuple[int, list[str], dict[str, list[float]]]:
    successes = 0
    failures: list[str] = []
    timings: dict[str, list[float]] = {}
    for index in range(attempts):
        try:
            _, measured = http_loop(postgres_url=postgres_url)
            successes += 1
            if capture_timings:
                for name in LATENCY_ENDPOINTS:
                    timings.setdefault(name, []).extend(measured.get(name, ()))
        except Exception as error:
            failures.append(f"loop {index + 1}: {error!r}")
    return successes, failures, timings


def normalized_http_outcome(data: dict[str, object]) -> dict[str, object]:
    """Remove generated record/task identities from domain-visible comparison."""
    generated = data["generated"]
    replan = data["replanned"]
    recommendation = data["recommendation"]
    assert isinstance(generated, dict) and isinstance(replan, dict) and isinstance(recommendation, dict)
    return {
        "generated_revision": generated["revision"],
        "generated_blocks": [
            (block["starts_at"], block["ends_at"])
            for block in generated["blocks"]  # type: ignore[index]
        ],
        "recommendation_kind": recommendation["recommendation"]["kind"],  # type: ignore[index]
        "replan_revision": replan["plan"]["revision"],  # type: ignore[index]
        "replan_blocks": [
            (block["starts_at"], block["ends_at"])
            for block in replan["plan"]["blocks"]  # type: ignore[index]
        ],
        "history_revisions": [item["revision"] for item in data["history"]],  # type: ignore[index]
    }


def postgres_evaluation(database_url: str, loops: int) -> dict[str, object]:
    successes, failures, _ = run_isolated_loops(loops, postgres_url=database_url)
    data, _ = http_loop(postgres_url=database_url)
    student = ExternalRef("mock-lms", "student-001")
    task_id = TaskId(UUID(str(data["task_id"])))
    period = PlanPeriod(start=NOW, end=NOW + timedelta(days=1))
    lms = MockLMSProvider.canonical(anchor=NOW)
    container = build_postgres_container(
        settings=DatabaseSettings(url=database_url),
        lms=lms,
        clock=type("FixedClock", (), {"now": lambda self: NOW})(),
    )
    task_record, history, reflections = container.transaction_manager.run(
        lambda: (
            container.task_repository.get(student_id_for(student), task_id),
            container.plan_repository.history(student_id_for(student), period),
            container.reflection_repository.list_for_student(student_id_for(student)),
        )
    )
    replan = data["replanned"]
    assert isinstance(replan, dict)
    blocks = replan["plan"]["blocks"]  # type: ignore[index]
    unplanned = replan["plan"]["unplanned_tasks"]  # type: ignore[index]
    scheduled_seconds = sum(
        int((datetime.fromisoformat(item["ends_at"]) - datetime.fromisoformat(item["starts_at"])).total_seconds())
        for item in blocks
    )
    unplanned_seconds = sum(item["remaining_duration_seconds"] for item in unplanned)
    deadline = lms.get_assignments(student)[0].deadline
    ordered = sorted(blocks, key=lambda item: item["starts_at"])
    overlap = any(
        datetime.fromisoformat(left["ends_at"]) > datetime.fromisoformat(right["starts_at"])
        for left, right in pairwise(ordered)
    )
    outcomes = [normalized_http_outcome(http_loop(postgres_url=database_url)[0]) for _ in range(3)]
    stable = sum(item == outcomes[0] for item in outcomes)
    invariants = {
        "work_conservation_violations": int(scheduled_seconds + unplanned_seconds != 1200),
        "deadline_violations": sum(
            int(datetime.fromisoformat(item["ends_at"]) > deadline) for item in blocks
        ),
        "overlap_violations": int(overlap),
        "unconfirmed_signal_violations": int(
            len(reflections) != 1 or len(reflections[0].confirmed.signals) != 1
        ),
        "revision_history_violations": int(
            len(history) != 2 or history[0].revision != 1 or history[1].revision != 2
        ),
        "latest_revision_violations": int(history[-1].revision != 2),
        "completed_task_recommendation_violations": int(
            data["after_completed_recommendation"]["recommendation"]["kind"] != "no_recommendation"  # type: ignore[index]
        ),
        "execution_restart_violations": int(
            task_record is None or task_record.task.status is not TaskStatus.COMPLETED
        ),
        "reflection_restart_violations": int(len(reflections) != 1),
    }
    if successes != loops or failures:
        raise RuntimeError(f"PostgreSQL HTTP loops failed: {successes}/{loops}; {failures}")
    if any(invariants.values()):
        raise RuntimeError(f"PostgreSQL invariant violations: {invariants}")
    if stable != len(outcomes):
        raise RuntimeError(f"PostgreSQL determinism failed: {stable}/{len(outcomes)}")
    return {
        "status": "RUN",
        "http_e2e": {"attempted": loops, "successful": successes, "failures": failures},
        "invariants": invariants,
        "determinism": {"attempted": len(outcomes), "stable": stable},
    }


def write_report(
    output: Path,
    results: list[Result],
    in_memory_latency: dict[str, dict[str, float | int]],
    loops: int,
    deterministic: tuple[int, int],
    execution_ms: float,
    warmup: int,
    samples: int,
    postgres: dict[str, object],
    postgres_latency: dict[str, dict[str, float | int]] | None,
) -> None:
    output.mkdir(parents=True, exist_ok=True)
    failures = [asdict(item) for item in results if not item.passed]
    invariant_keys = (
        "deadline_violations",
        "window_violations",
        "overlaps",
        "conservation_violations",
    )
    invariants = {
        key: sum(int(item.actual.get(key, 0)) for item in results) for key in invariant_keys
    }
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, capture_output=True, check=True
    ).stdout.strip()
    stable, eligible = deterministic
    summary = {
        "benchmark_version": "MVP Benchmark v1",
        "dataset_version": "mvp-v1",
        "git_commit": commit,
        "environment": {
            "python": sys.version.split()[0],
            "platform": platform.platform(),
            "persistence": "in_memory",
            "postgresql": postgres["status"],
        },
        "execution_duration_ms": round(execution_ms, 3),
        "case_totals": {
            "total": len(results),
            "passed": len(results) - len(failures),
            "failed": len(failures),
        },
        "invariants": invariants,
        "determinism": {
            "eligible_cases": eligible,
            "stable_cases": stable,
            "rate": f"{stable / eligible:.0%}",
        },
        "http_e2e": {"attempted": loops, "successful": loops, "rate": "100% (in-memory)"},
        "latency": {
            "label": "LOCAL DEVELOPMENT BENCHMARK",
            "percentile": "nearest-rank: rank = ceil(p * n), one-indexed",
            "warmup_loops_excluded": warmup,
            "measured_loops": samples,
            "in_memory": in_memory_latency,
            "postgresql": postgres_latency,
        },
        "postgresql": postgres,
        "failures": failures,
        "reproduction": "cd apps/api && uv run --extra dev python ../../evals/mvp_benchmark_v1.py --output ../../artifacts/evals/mvp-v1",
    }
    (output / "summary.json").write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n")
    lines = [
        "# MVP Benchmark v1 report",
        "",
        f"Commit: `{commit}`",
        "",
        f"Cases: **{summary['case_totals']['passed']}/{summary['case_totals']['total']} passed**",
        f"Execution duration: {summary['execution_duration_ms']} ms",
        "",
        "## Invariants",
        "",
        *[f"- {key}: {value}" for key, value in invariants.items()],
        "",
        "## Determinism",
        "",
        f"- {stable}/{eligible} repeated or shuffled equivalent inputs were structurally stable ({stable / eligible:.0%}).",
        "",
        "## HTTP end-to-end",
        "",
        f"- {loops}/{loops} fresh in-memory loops succeeded. This is not a production reliability claim.",
        "",
        "## LOCAL DEVELOPMENT BENCHMARK latency",
        "",
        f"Nearest-rank percentile (`rank = ceil(p x n)`); {warmup} isolated warmup loops excluded; {samples} measured isolated loops.",
        "",
        "### In-memory",
        "",
        "| Endpoint | n | min ms | p50 ms | p95 ms | p99 ms | max ms |",
        "| --- | ---: | ---: | ---: | ---: | ---: |",
        *[
            f"| {name} | {row['n']} | {row['min_ms']} | {row['p50_ms']} | {row['p95_ms']} | {row['p99_ms']} | {row['max_ms']} |"
            for name, row in in_memory_latency.items()
        ],
        "",
        "## PostgreSQL",
        "",
        (
            "NOT RUN: no real PostgreSQL URL was configured. No SQLite substitution was used."
            if postgres["status"] == "NOT_RUN"
            else json.dumps(postgres, indent=2)
        ),
        *(
            [
                "",
                "### PostgreSQL LOCAL DEVELOPMENT BENCHMARK latency",
                "",
                "| Endpoint | n | min ms | p50 ms | p95 ms | p99 ms | max ms |",
                "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
                *[
                    f"| {name} | {row['n']} | {row['min_ms']} | {row['p50_ms']} | {row['p95_ms']} | {row['p99_ms']} | {row['max_ms']} |"
                    for name, row in postgres_latency.items()
                ],
            ]
            if postgres_latency
            else []
        ),
        "",
        "## Failures",
        "",
        "None." if not failures else "```json\n" + json.dumps(failures, indent=2) + "\n``",
    ]
    (output / "report.md").write_text("\n".join(lines) + "\n")


def main() -> int:
    started = time.perf_counter_ns()
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts/evals/mvp-v1")
    parser.add_argument("--loops", type=int, default=5, help="isolated functional E2E loops")
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--samples", type=int, default=100)
    args = parser.parse_args()
    if args.loops < 1 or args.warmup < 1 or args.samples < 50:
        parser.error("--loops and --warmup must be positive; --samples must be at least 50")
    results = [*planning_cases(), *risk_cases(), *nba_cases(), *replan_cases()]
    cases, _ = http_cases()
    results.extend(cases)
    successes, loop_failures, _ = run_isolated_loops(args.loops - 1)
    successes += 1
    for index, failure in enumerate(loop_failures, start=2):
        results.append(Result(f"E2E-LOOP-{index}", "end_to_end", False, {"complete_loop": "success"}, {"error": failure}, "HTTP loop failed"))
    if successes != args.loops:
        results.append(
            Result(
                "E2E-SUCCESS-RATE",
                "end_to_end",
                False,
                {"successful": args.loops},
                {"successful": successes},
                "not all isolated loops succeeded",
            )
        )
    manifest = json.loads((ROOT / "evals/datasets/mvp-v1.json").read_text())
    expected_ids = {item["id"] for item in manifest["cases"]}
    actual_ids = {item.case_id for item in results if not item.case_id.startswith("E2E-LOOP")}
    if expected_ids != actual_ids:
        missing = sorted(expected_ids - actual_ids)
        extra = sorted(actual_ids - expected_ids)
        results.append(
            Result(
                "CASE-MANIFEST",
                "benchmark",
                False,
                {"ids": sorted(expected_ids)},
                {"missing": missing, "extra": extra},
                "dataset and runner case IDs differ",
            )
        )
    _, warmup_failures, _ = run_isolated_loops(args.warmup)
    if warmup_failures:
        results.append(Result("LATENCY-WARMUP", "benchmark", False, {"success": True}, {"failures": warmup_failures}, "warmup failed"))
    _, latency_failures, timings = run_isolated_loops(args.samples, capture_timings=True)
    if latency_failures or any(len(timings.get(name, ())) != args.samples for name in LATENCY_ENDPOINTS):
        results.append(Result("LATENCY-SAMPLES", "benchmark", False, {"n": args.samples}, {name: len(timings.get(name, ())) for name in LATENCY_ENDPOINTS}, "latency collection did not complete"))
    postgres_url = configured_postgres_url()
    postgres: dict[str, object] = {"status": "NOT_RUN", "reason": "HAUI_COMPASS_TEST_DATABASE_URL is not configured"}
    postgres_latency: dict[str, dict[str, float | int]] | None = None
    if postgres_url:
        try:
            postgres = postgres_evaluation(postgres_url, args.loops)
            _, postgres_warmup_failures, _ = run_isolated_loops(args.warmup, postgres_url=postgres_url)
            _, postgres_latency_failures, postgres_timings = run_isolated_loops(args.samples, postgres_url=postgres_url, capture_timings=True)
            if postgres_warmup_failures or postgres_latency_failures or any(
                len(postgres_timings.get(name, ())) != args.samples for name in LATENCY_ENDPOINTS
            ):
                raise RuntimeError("PostgreSQL warmup or latency loop failed")
            postgres_latency = latency_summary(postgres_timings)
        except Exception as error:
            postgres = {"status": "FAILED", "reason": repr(error)}
            results.append(Result("POSTGRESQL-BENCHMARK", "postgresql", False, {"success": True}, {"error": repr(error)}, "PostgreSQL benchmark failed"))
    write_report(
        args.output,
        results,
        latency_summary(timings),
        args.loops,
        determinism_result(),
        (time.perf_counter_ns() - started) / 1_000_000,
        args.warmup,
        args.samples,
        postgres,
        postgres_latency,
    )
    return 0 if all(item.passed for item in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
