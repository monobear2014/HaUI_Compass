from datetime import UTC, datetime, timedelta
from itertools import permutations

from haui_compass.domain.plans.plan import PlanPeriod, StudyPlan, StudyWindow
from haui_compass.domain.plans.planning import PlanningCandidate
from haui_compass.domain.students.ids import StudentId
from haui_compass.domain.tasks.task import TaskStatus
from haui_compass.engines.planning.schedule import generate_weekly_plan
from support.builders import make_assignment, make_task, task_id

START = datetime(2026, 10, 5, 0, 0, tzinfo=UTC)
PERIOD = PlanPeriod(start=START, end=START + timedelta(days=7))
STUDENT_ID = StudentId(task_id(990))


def candidate(
    n: int,
    *,
    minutes: int,
    deadline: datetime,
    status: TaskStatus = TaskStatus.NOT_STARTED,
) -> PlanningCandidate:
    return PlanningCandidate(
        task=make_task(n, n, minutes=minutes, status=status),
        assignment=make_assignment(n, deadline=deadline),
    )


def window(day: int, start_hour: int, minutes: int) -> StudyWindow:
    starts_at = START + timedelta(days=day, hours=start_hour)
    return StudyWindow(starts_at=starts_at, ends_at=starts_at + timedelta(minutes=minutes))


def plan(candidates: tuple[PlanningCandidate, ...], windows: tuple[StudyWindow, ...]) -> StudyPlan:
    return generate_weekly_plan(
        student_id=STUDENT_ID,
        candidates=candidates,
        period=PERIOD,
        study_windows=windows,
        generated_at=START,
    )


def planned_duration(result: StudyPlan) -> timedelta:
    return sum((block.duration for block in result.blocks), timedelta(0))


def test_adding_capacity_never_reduces_planned_work() -> None:
    tasks = (
        candidate(1, minutes=180, deadline=START + timedelta(days=3)),
        candidate(2, minutes=120, deadline=START + timedelta(days=4)),
    )
    original = plan(tasks, (window(0, 19, 120),))
    expanded = plan(tasks, (window(0, 19, 120), window(1, 19, 120)))
    assert planned_duration(expanded) >= planned_duration(original)


def test_moving_deadline_later_never_reduces_feasibility() -> None:
    windows = (window(0, 19, 60), window(1, 19, 60))
    early = plan(
        (candidate(1, minutes=120, deadline=START + timedelta(days=1)),),
        windows,
    )
    later = plan(
        (candidate(1, minutes=120, deadline=START + timedelta(days=2)),),
        windows,
    )
    assert planned_duration(later) >= planned_duration(early)
    assert sum((item.remaining_effort for item in later.unplanned_tasks), timedelta(0)) <= sum(
        (item.remaining_effort for item in early.unplanned_tasks), timedelta(0)
    )


def test_completing_task_removes_it_from_next_plan() -> None:
    open_result = plan(
        (candidate(1, minutes=60, deadline=START + timedelta(days=2)),),
        (window(0, 19, 60),),
    )
    completed_result = plan(
        (
            candidate(
                1,
                minutes=60,
                deadline=START + timedelta(days=2),
                status=TaskStatus.COMPLETED,
            ),
        ),
        (window(0, 19, 60),),
    )
    assert {block.task_id for block in open_result.blocks} == {task_id(1)}
    assert completed_result.blocks == ()
    assert completed_result.unplanned_tasks == ()


def test_every_block_lies_inside_an_allowed_window_and_before_deadline() -> None:
    tasks = (
        candidate(1, minutes=90, deadline=START + timedelta(days=2)),
        candidate(2, minutes=120, deadline=START + timedelta(days=4)),
    )
    windows = (window(0, 19, 60), window(1, 18, 120), window(3, 9, 60))
    result = plan(tasks, windows)
    deadlines = {item.task.id: item.assignment.deadline for item in tasks}
    for block in result.blocks:
        assert any(
            block.starts_at >= available.starts_at and block.ends_at <= available.ends_at
            for available in windows
        )
        assert block.ends_at <= deadlines[block.task_id]


def test_task_effort_is_conserved_and_never_overplanned() -> None:
    tasks = (
        candidate(1, minutes=150, deadline=START + timedelta(days=2)),
        candidate(2, minutes=180, deadline=START + timedelta(days=4)),
    )
    result = plan(tasks, (window(0, 19, 120), window(1, 19, 90)))
    unplanned = {item.task_id: item.remaining_effort for item in result.unplanned_tasks}
    for item in tasks:
        scheduled = sum(
            (block.duration for block in result.blocks if block.task_id == item.task.id),
            timedelta(0),
        )
        assert scheduled <= item.task.estimated_duration
        assert scheduled + unplanned.get(item.task.id, timedelta(0)) == item.task.estimated_duration


def test_all_input_permutations_produce_same_plan() -> None:
    tasks = (
        candidate(1, minutes=60, deadline=START + timedelta(days=2)),
        candidate(2, minutes=90, deadline=START + timedelta(days=2)),
        candidate(3, minutes=30, deadline=START + timedelta(days=4)),
    )
    windows = (window(0, 19, 60), window(1, 18, 90), window(2, 20, 30))
    expected = plan(tasks, windows)
    for task_order in permutations(tasks):
        for window_order in permutations(windows):
            assert plan(task_order, window_order) == expected
