# IntelliPlan Planner Reference

## Scope inspected

This note examines the current IntelliPlan scheduling path as a read-only architectural reference. It focuses on the domain plan types, day allocator, clock-window placement, feasibility checker, rescheduling flow, scheduling service, and the tests that define their behaviour.

The investigation is intentionally behavioural. No IntelliPlan source, constants, statistical priors, or implementation-specific scoring values are reproduced in HaUI Compass.

## Plan representation

IntelliPlan has two related representations:

1. Its planning engine returns an immutable `Plan` made of per-day `DayPlan` values. Each day contains `Session` values with a task identity, calendar date, duration in minutes, part numbering, priority/context metadata, and human-readable reasons. The plan also carries task-level deferrals, overload status, total scheduled work, total capacity, and notes.
2. Its scheduling service converts that day-level plan into an application-facing `schedule_data` mapping. A separate clock-placement pass turns sessions into timestamped blocks inside concrete availability windows and reports placement overflow.

The distinction matters: choosing a day and choosing an exact start/end time are separate responsibilities in IntelliPlan. HaUI Compass Weekly Planner v0 can operate directly at the explicit-window level because its input already supplies concrete UTC study windows.

## Planner inputs

The current IntelliPlan planner consumes normalized planner tasks, per-day capacity, an optional estimation model, an explicit planning date, planner configuration, and optional follow-through and prior-plan anchors.

Its task representation is assignment-like rather than a minimal task fact. It may contain due date, estimated minutes, course, kind, priority, difficulty, subtasks, dependencies, work already done, concepts, calibrated estimates, manual pins, earliest-start restrictions, and previous sittings. The scheduling service derives these inputs from assignment-shaped rows and student context.

The service layer additionally uses availability, recurring commitments, dated calendar conflicts, preferred time, historical feedback, observed sessions, weak weekdays, concept mastery, daily target, and optional follow-through history. These are richer than Weekly Planner v0 needs.

## Capacity model

Capacity is represented in two stages:

- Concrete daily availability windows are calculated after subtracting commitments and dated busy periods.
- Those windows are reduced to usable study minutes per day for the optimizer. The calculation reserves time for transitions and breaks so day allocation does not promise more study time than clock placement can realize.

A daily capacity can also carry a quality multiplier and a soft comfort target. Physical availability is treated as a hard bound for ordinary placement; quality and comfort are preferences. Specific-day capacity overrides are supported by the application service.

For HaUI Compass v0, reducing capacity to a daily integer would lose the time-of-day information required by the task. Explicit `StudyWindow` intervals should therefore remain the source of capacity and be consumed directly.

## Hard constraints

The inspected implementation treats these as hard or effectively hard constraints:

- A session cannot be placed beyond its task deadline.
- Ordinary scheduled work must fit available capacity; unplaceable work is deferred rather than hidden.
- Clock blocks must not overlap and must fit a real availability window.
- Blocks must not overlap known calendar commitments.
- Dependency ordering constrains prerequisite and dependent sessions.
- Pinned/manual placements are preserved, although IntelliPlan may retain an over-capacity pin and report the consequence rather than moving it.
- The feasibility checker classifies overlaps, after-deadline work, non-positive durations, date mismatches, calendar conflicts, and outside-window work as hard violations.

Weekly Planner v0 only needs the first three categories: positive intervals, non-overlap/capacity, and no work after an assignment deadline. Dependencies, manual pins, and external calendar conflicts are out of scope.

## Soft preferences

IntelliPlan prices rather than forbids several preferences: balanced daily load, earlier placement for urgent/high-priority work, deadline buffer, spacing repeated sessions, reduced context switching, avoiding historically weak days, avoiding tiny fragments, avoiding stacking unfamiliar concepts, predicted follow-through, and stability relative to an existing plan.

Its separate feasibility checker likewise treats short blocks, excessive continuous work, daily load above the declared capacity (within that checker’s representation), and past blocks as soft findings rather than necessarily making the whole plan infeasible.

Weekly Planner v0 should not inherit this weighted preference system. A transparent lexicographic policy is easier to reproduce and evaluate before behavioural evidence exists.

## Feasibility

IntelliPlan never assumes every workload fits. Unplaced work becomes a task-level deferral and the plan reports overload and explanatory notes. A second feasibility component validates a fully rendered schedule independently because plans may also be edited, restored, or produced through other paths.

The planner attempts placement, local improvement, a retry of deferred sessions, and capacity triage. Even after those passes, scheduled plus deferred work remains visible; tests explicitly protect against silently losing work.

HaUI Compass should reuse the invariant that every unit of requested effort is either planned or represented as remaining unplanned effort with a typed reason.

## Session splitting

IntelliPlan’s planning unit is a session/sitting derived from a task-like input. Assignment-shaped work is first estimated, remaining effort is calculated, and long work is divided into multiple sessions. Sessions can span multiple days. Splitting aims to avoid a large final stub and can be influenced by focus stamina, work kind, difficulty, subtask count, previous sittings, and the largest available day.

There is also defensive splitting in the clock-placement path for oversized legacy or externally produced blocks.

HaUI Compass v0 needs splitting, but not cognitive optimization. It can consume a task’s explicit estimate sequentially across windows, producing at most one block per task per contiguous available segment. No minimum block constant is required: the caller’s windows and exact remaining effort define useful capacity without inventing a universal cognitive threshold.

## Determinism and tie breaking

The core IntelliPlan planner is deterministic when all inputs, including the planning date, model state, completion function, and anchors, are fixed. It seeds placement in a stable order using constraint/deadline information, priority, difficulty, task identity, and part identity. Candidate days are scanned in stable date order, and local search accepts only strict improvements. Tests assert repeatability.

Some service defaults read the wall clock if the caller omits time, while optional risk simulation may use an explicit seed. Those defaults are outside the pure planner itself.

For HaUI Compass v0, task input order, assignment input order, and study-window input order must not influence the result. The final task tie-break should use stable assignment and task identifiers, and windows should be normalized and sorted before allocation.

## Behavioural dependencies

The current IntelliPlan path can depend on historical estimate calibration, measured focus stamina, preferred work periods, weak weekdays, concept mastery, prior completion/follow-through observations, fatigue/load effects, work already completed, missed sittings, previous plan anchors, and student-pinned sessions.

Its rescheduling flow credits completed or partial work, removes finished tasks, changes treatment of missed work, preserves stable anchors where possible, and computes plan-change explanations.

None of these belong in HaUI Compass Weekly Planner v0. The v0 planner must use the task’s stated estimate unchanged, consume neither execution nor reflection, and create a baseline plan rather than adapt an earlier one.

## Relevant tests

The most relevant IntelliPlan tests establish:

- splitting preserves total effort and avoids unusable fragments;
- no session is scheduled after its deadline;
- genuine overload and zero availability are reported explicitly;
- high-value work is protected when capacity is scarce;
- long work spans multiple sessions/days;
- only available days/windows are used;
- the same inputs produce the same plan;
- scheduled plus deferred effort accounts for all work;
- empty input is a valid empty plan;
- no session exceeds realizable capacity;
- split parts have stable chronological numbering;
- exact placement produces ordered, non-overlapping clock blocks;
- placement overflow becomes explicit deferral;
- overlap, deadline, availability, and calendar-conflict violations are independently detected; and
- rescheduling credits completed work, preserves unaffected work where possible, and explains changes.

These tests are stronger evidence of intended behaviour than UI copy or comments. The HaUI suite should adopt the applicable invariants, not IntelliPlan’s implementation or constants.

## Useful concepts

- Separate immutable plan facts from the algorithm that creates them.
- Treat a planned session/block as distinct from its source task.
- Use explicit capacity and never silently manufacture time.
- Allow one task’s effort to span multiple sessions.
- Enforce deadlines as hard bounds.
- Represent unplanned effort explicitly and account for all requested work.
- Normalize inputs and use stable final tie-breaks.
- Keep the engine pure and make generation time explicit.
- Test schedule invariants independently from example outputs.

## Concepts intentionally not reused

- Weighted multi-objective local search and its tuning values.
- Historical estimate correction or population priors.
- Follow-through probability and behavioural prediction.
- Difficulty, concept mastery, weak-day, and fatigue pricing.
- Deadline buffers, soft daily targets, and cognitive session-length heuristics.
- Assignment decomposition or template-generated stages.
- Dependency graphs, manual pins, prior-plan anchors, and stability cost.
- Risk simulation and optimizer feedback loops.
- Adaptive rescheduling, change explanations, and calendar integration.
- Human-readable coaching generated inside the planner.

These are valid concerns for a mature scheduler but would obscure the baseline semantics and mix future adaptive-replanning responsibilities into v0.

## Implications for HaUI Compass Weekly Planner v0

Weekly Planner v0 should accept explicit `Task` plus `Assignment` candidates, an explicit UTC planning period, explicit UTC study windows, an explicit generation instant, and a small versioned `PlanningPolicy`.

It should ignore completed tasks and order remaining candidates lexicographically by assignment deadline, then prefer `IN_PROGRESS` over `NOT_STARTED` only when deadlines tie, then use assignment id and task id as stable tie-breaks. Risk should not be an input: capacity-before-deadline is partly determined by the same windows the planner is consuming, so feeding a separately derived risk signal back into placement would add circular semantics without improving the baseline.

The engine should normalize and merge overlapping or touching windows so capacity cannot be counted twice. It should allocate exact `timedelta` effort from the earliest remaining window segments, never extend a block past the earlier of the window end, assignment deadline, and planning-period end. A task may therefore produce multiple `StudyBlock` values.

Every open task should appear either as fully planned blocks or as an `UnplannedTask` with exact remaining effort and a typed reason. V0 only needs reasons that correspond to observable outcomes: no eligible study window before the deadline, or insufficient eligible capacity. Tasks whose deadline is at or before the period start naturally have no eligible window; tasks whose deadline lies after the horizon may still be planned within the supplied horizon and are not inherently infeasible.

## Source modules inspected

- `.references/IntelliPlan/intelliplan/domain/plan.py`
- `.references/IntelliPlan/intelliplan/intelligence/planner.py`
- `.references/IntelliPlan/intelliplan/intelligence/constraints.py`
- `.references/IntelliPlan/intelliplan/intelligence/rescheduling.py`
- `.references/IntelliPlan/intelliplan/services/scheduling.py`
- `.references/IntelliPlan/scheduler_engine.py`
- `.references/IntelliPlan/tests/intelliplan/test_planner.py`
- `.references/IntelliPlan/tests/intelliplan/test_planner_followthrough.py`
- `.references/IntelliPlan/tests/intelliplan/test_constraints.py`
- `.references/IntelliPlan/tests/intelliplan/test_rescheduling.py`
- `.references/IntelliPlan/tests/intelliplan/test_scheduling_service.py`
