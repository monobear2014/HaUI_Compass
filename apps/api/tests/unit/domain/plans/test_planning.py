from datetime import timedelta

import pytest

from haui_compass.domain.plans.planning import PlanningCandidate, PlanningPolicy
from haui_compass.domain.shared.errors import DomainValidationError
from support.builders import NOW, make_assignment, make_task


def test_candidate_requires_matching_assignment() -> None:
    with pytest.raises(DomainValidationError, match="does not belong"):
        PlanningCandidate(
            task=make_task(1, 1),
            assignment=make_assignment(2, deadline=NOW + timedelta(days=1)),
        )


def test_policy_requires_positive_version() -> None:
    with pytest.raises(DomainValidationError, match="at least 1"):
        PlanningPolicy(planner_version=0, prefer_in_progress_when_deadlines_tie=True)
