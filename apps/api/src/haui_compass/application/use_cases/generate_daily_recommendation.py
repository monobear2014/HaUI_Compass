"""GenerateDailyRecommendation: the first end-to-end decision pipeline.

    LMSProvider -> assignment mapping
    explicit tasks + explicit capacity
        -> StudentState -> RiskEngine (per assignment) -> ActionCandidates -> NextBestAction
        -> DailyRecommendationResult

This use case only coordinates. Every calculation is done by an existing pure engine, and the LMS is
reached only through the ``LMSProvider`` port. The clock is read exactly once, and that single
instant is passed to every engine, so the whole result is one coherent snapshot.

Deliberate v0 limits: LMS submission status is not used (the domain has no ``Submission`` yet, and
whether a submitted assignment's remaining tasks still matter is the task supplier's call), and the
supplied tasks are taken to be the full remaining work of their assignment.
"""

from collections import defaultdict
from datetime import timedelta

from haui_compass.application.lms_mapping import (
    AssignmentMapping,
    assignment_id_for,
    map_assignments,
    student_id_for,
)
from haui_compass.application.ports.clock import Clock
from haui_compass.application.ports.lms import LMSProvider
from haui_compass.application.use_cases.daily_recommendation import (
    AssignmentRisk,
    DailyRecommendationInputError,
    DailyRecommendationResult,
    GenerateDailyRecommendationRequest,
    InputErrorCode,
)
from haui_compass.domain.assignments.assignment import Assignment, AssignmentId
from haui_compass.domain.recommendations.candidate import ActionCandidate
from haui_compass.domain.recommendations.policy import (
    DEFAULT_RECOMMENDATION_POLICY,
    RecommendationPolicy,
)
from haui_compass.domain.risk.context import AssignmentRiskContext
from haui_compass.domain.risk.policy import DEFAULT_RISK_POLICY, RiskPolicy
from haui_compass.domain.tasks.task import Task, TaskId, TaskStatus
from haui_compass.engines.next_best_action.recommend import recommend_next_action
from haui_compass.engines.risk.assess import assess_assignment_risk
from haui_compass.engines.student_state.derive import derive_student_state


class GenerateDailyRecommendation:
    def __init__(
        self,
        *,
        lms: LMSProvider,
        clock: Clock,
        risk_policy: RiskPolicy = DEFAULT_RISK_POLICY,
        recommendation_policy: RecommendationPolicy = DEFAULT_RECOMMENDATION_POLICY,
    ) -> None:
        self._lms = lms
        self._clock = clock
        self._risk_policy = risk_policy
        self._recommendation_policy = recommendation_policy

    def execute(self, request: GenerateDailyRecommendationRequest) -> DailyRecommendationResult:
        """Run the pipeline.

        Raises ``DailyRecommendationInputError`` if the request contradicts itself or the LMS data,
        and ``LMSNotFoundError`` if the LMS does not know the student. An empty or fully completed
        workload is not an error: it yields a ``NoRecommendation``.
        """
        now = self._clock.now()  # the only clock read; every stage below receives this instant

        mapping = map_assignments(self._lms.get_assignments(request.student))
        assignments = {m.assignment.id: m.assignment for m in mapping.mapped}
        _validate(request, assignments, mapping)

        state = derive_student_state(
            student_id=student_id_for(request.student),
            tasks=request.tasks,
            available_capacity=request.available_capacity,
            now=now,
        )

        capacity_by_assignment = {
            c.assignment_id: c.available_until_deadline for c in request.assignment_capacities
        }
        tasks_by_assignment: dict[AssignmentId, list[Task]] = defaultdict(list)
        for task in request.tasks:
            tasks_by_assignment[task.assignment_id].append(task)

        assignment_risks: list[AssignmentRisk] = []
        candidates: list[ActionCandidate] = []
        for assignment_id in sorted(
            tasks_by_assignment, key=lambda i: (assignments[i].deadline, i)
        ):
            assignment = assignments[assignment_id]
            open_tasks = [
                t
                for t in tasks_by_assignment[assignment_id]
                if t.status is not TaskStatus.COMPLETED
            ]
            risk = assess_assignment_risk(
                AssignmentRiskContext(
                    assignment_id=assignment_id,
                    now=now,
                    deadline=assignment.deadline,
                    open_task_count=len(open_tasks),
                    remaining_effort=sum((t.estimated_duration for t in open_tasks), timedelta(0)),
                    # None (unknown) unless the caller gave capacity for this assignment's horizon.
                    available_capacity_until_deadline=capacity_by_assignment.get(assignment_id),
                ),
                self._risk_policy,
            )
            assignment_risks.append(AssignmentRisk(assignment=assignment, risk=risk))
            candidates.extend(
                ActionCandidate(task=t, assignment=assignment, risk=risk) for t in open_tasks
            )

        return DailyRecommendationResult(
            as_of=state.as_of,
            student_state=state,
            assignment_risks=tuple(assignment_risks),
            recommendation=recommend_next_action(
                candidates, now=now, policy=self._recommendation_policy
            ),
            skipped_assignments=mapping.skipped,
        )


def _validate(
    request: GenerateDailyRecommendationRequest,
    assignments: dict[AssignmentId, Assignment],
    mapping: AssignmentMapping,
) -> None:
    undated = {assignment_id_for(s.source) for s in mapping.skipped}

    seen_tasks: set[TaskId] = set()
    for task in sorted(request.tasks, key=lambda t: t.id):
        if task.id in seen_tasks:
            raise DailyRecommendationInputError(
                InputErrorCode.DUPLICATE_TASK_ID, f"duplicate task id: {task.id}"
            )
        seen_tasks.add(task.id)
        if task.assignment_id in undated:
            raise DailyRecommendationInputError(
                InputErrorCode.TASK_FOR_UNDATED_ASSIGNMENT,
                f"task {task.id} is for an LMS assignment with no deadline; it cannot be assessed",
            )
        if task.assignment_id not in assignments:
            raise DailyRecommendationInputError(
                InputErrorCode.TASK_FOR_UNKNOWN_ASSIGNMENT,
                f"task {task.id} is for an assignment the LMS does not report for this student",
            )

    seen_capacities: set[AssignmentId] = set()
    for capacity in sorted(request.assignment_capacities, key=lambda c: c.assignment_id):
        if capacity.assignment_id in seen_capacities:
            raise DailyRecommendationInputError(
                InputErrorCode.DUPLICATE_ASSIGNMENT_CAPACITY,
                f"capacity given twice for assignment {capacity.assignment_id}",
            )
        seen_capacities.add(capacity.assignment_id)
        if capacity.assignment_id not in assignments:
            raise DailyRecommendationInputError(
                InputErrorCode.CAPACITY_FOR_UNKNOWN_ASSIGNMENT,
                f"capacity given for unknown or undated assignment {capacity.assignment_id}",
            )
