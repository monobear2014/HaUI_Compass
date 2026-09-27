# IntelliPlan Replanning Reference

## Scope inspected

This note reviews IntelliPlan's current rescheduling, autopilot, override, robust-planning, stability-cost, scheduling-service, and behavioural tests as read-only architectural research. It describes observed responsibilities and trade-offs without reproducing source, thresholds, weights, priors, or implementation details.

## Replanning triggers

IntelliPlan supports both explicit student intent and automatic triggers. Explicit disruptions include losing or limiting a day, adding time, pushing or pinning work, marking work done, recording progress, and requesting catch-up. Autopilot can react to factual changes such as missed work, newly discovered assignments, and changed deadlines. Risk-only triggers are throttled by a cooldown, while factual changes can run immediately. Autopilot can be disabled or temporarily suppressed after an undo.

## Baseline-plan handling

The saved schedule is reconstructed into planner inputs: remaining tasks, future sittings, past missed minutes, and completed minutes. The replan is therefore based on the visible baseline rather than only on fresh LMS data. IntelliPlan still invokes its general planner over the remaining horizon, but supplies prior sitting sizes and locations so the optimizer can reproduce or minimally repair the existing plan.

This is not strict block preservation. The optimizer may move valid work when its weighted objective finds enough benefit. HaUI Compass v0 requires a stronger rule: preserve every still-valid future block unless a concrete constraint or remaining-effort change requires modification.

## Stability strategy

IntelliPlan represents previous sitting locations as anchors and charges the optimizer for moving them. Stability cost is stronger for near-term work. Existing sitting sizes are also reused so a replan does not silently reshape a visible block into different parts. Replanning compares a literal/minimal response with a rebalanced alternative and selects additional movement only when its simulated benefit crosses configured thresholds.

HaUI Compass v0 should avoid a weighted stability score. Preservation can be a deterministic eligibility decision: valid baseline blocks remain; only invalid or excess work enters reallocation.

## Frozen / historical work

Checked-off blocks are credited and removed from remaining planner input. Work on past days that was not completed is treated as missed work needing a new placement. Student-pinned sittings are fixed and cannot be moved by optimization or overload triage, even when the pin causes an over-capacity consequence that must be surfaced.

The inspected system reasons primarily at calendar-day granularity in its planner snapshot. HaUI Compass has timestamped `StudyBlock`s, so it can define a sharper boundary: blocks ending at or before `effective_at` and blocks crossing that instant are historical/frozen in v0; only blocks starting at or after it are eligible for revision.

## Remaining-work handling

IntelliPlan infers remaining minutes from unchecked saved blocks and deferred work, subtracts checked/credited work, and marks those minutes as already calibrated so the estimation model does not correct them twice. Partial-progress intents directly reduce those inferred minutes.

HaUI Compass v0 intentionally does not reuse this behaviour. An execution duration does not establish how much work remains. Every open task in scope must have an explicit `TaskRemainingEffort`; unknown remaining effort should be rejected rather than guessed or silently replaced by the original estimate.

## Execution inputs

IntelliPlan consumes checked blocks, active-study credit, missed sittings, finished task identities, and partial-progress intents. Missed work can increase priority, while completed/credited work shrinks or removes remaining work.

HaUI Compass will accept `TaskExecutionSummary` as factual context and validate task identity/completion consistency, but it will not subtract `total_actual_duration` from an estimate. Current `Task.status` and explicit remaining effort determine what may be planned; execution facts may appear only in structured change evidence.

## Overrides

IntelliPlan offers direct plan edits and higher-level disruption intents. Moving, skipping, and shortening work update plan totals and explicit deferrals. Capacity overrides can set or add time for a date. Push and pin rules constrain when or where work may be placed. Overrides are generally accepted and accompanied by consequences rather than blocked.

These controls exceed HaUI Compass Replanning v0. Current `StudyWindow`s and current assignment deadlines are the only constraint overrides in scope; manual pinning, user drag/drop semantics, and consequence simulation remain future work.

## Behavioural dependencies

The current IntelliPlan path may use historical estimate calibration, measured stamina, day/time follow-through, fatigue/load response, weak weekdays, concept mastery, deadline proximity, and probabilistic risk simulation. Behaviour can influence both placement cost and comparison of minimal versus rebalanced plans.

HaUI Compass v0 will use none of these. It will not estimate motivation, procrastination, completion probability, calibrated duration, or a preferred session length.

## Plan-churn handling

IntelliPlan computes structured before/after changes by comparing task groups and their scheduled days. It reports moved, added, removed, and deferred work, along with a sitting-level churn measure. The system can explain whether it chose a minimal or rebalanced strategy and maintains a bounded autopilot log.

HaUI Compass should expose concrete counts and durations rather than a synthetic stability score: preserved future blocks, changed future blocks, moved duration, and newly unplanned duration. Preservation itself should remain implicit in the change list so no-change output stays concise.

## Relevant tests

The inspected tests establish that:

- an untouched plan reproduces itself;
- clearing or limiting one day moves only necessary work;
- pinned work stays fixed;
- completed work disappears and unblocks dependent work;
- partial progress shrinks inferred remaining work in IntelliPlan's model;
- changed deadlines are detected and work is not left after the new deadline;
- additional time does not worsen the risk forecast;
- every replan has an explanation;
- previous sitting sizes and locations survive when possible;
- autopilot respects disable, undo, cooldown, new-work, and factual-change rules;
- direct moves/skips/shortening preserve totals or create explicit deferrals; and
- overrides report both benefits and costs without hiding infeasibility.

For HaUI Compass, the no-change, stability, deadline, explicit-deferral, work-conservation, and deterministic tests are directly relevant. Tests based on inferred remaining work, risk simulation, or behavioural probability are intentionally not adopted.

## Useful concepts

- Treat the existing plan as a first-class baseline.
- Separate historical work from future work before modifying anything.
- Preserve prior blocks and session sizes unless a current fact invalidates them.
- Make disruptions and plan changes typed and auditable.
- Keep unplaceable work visible.
- Compare plans with measurable facts rather than unexplained prose.
- Make current availability and deadlines explicit inputs.
- Keep replanning deterministic and clock-independent.

## Concepts intentionally not reused

- Inferring remaining effort from saved block duration, checkboxes, or execution minutes.
- Historical estimate correction and calibrated task flags.
- Weighted stability/change penalties.
- Completion-probability and risk simulation.
- Population priors, stamina, fatigue, weak-day, and concept-mastery signals.
- Cooldown-driven autonomous execution and autopilot persistence.
- Manual pins, push intents, arbitrary calendar overrides, and drag/drop recovery.
- Dependency-chain reconstruction and assignment decomposition.
- Choosing between plans using probabilistic benefit thresholds.

## Implications for HaUI Compass Replanning v0

The replanner should receive a baseline `StudyPlan`, current tasks and assignments, current study windows, explicit remaining effort for every open task, optional execution summaries, optional confirmed reflection signals, and an explicit `effective_at`.

Blocks ending at or before `effective_at` should remain unchanged. A block crossing `effective_at` should also be frozen in full for v0: splitting a session would manufacture a partial execution fact, while rejecting a mid-session request is unnecessarily restrictive. Its duration counts against the task's explicit remaining effort because that effort describes work remaining at the replanning instant; callers should normally invoke replanning between sessions. This conservative rule is explicit and testable.

For future blocks, preserve a block only when its task remains open, its assignment still exists, the block fits a current window and current deadline, and preserving it does not exceed that task's explicit remaining effort. Preserve earlier baseline blocks first when explicit remaining effort decreases. Invalid or excess future blocks are removed from the baseline; only the still-unallocated explicit effort is sent through the existing Weekly Planner using residual windows after preserved/frozen blocks are subtracted.

Unknown remaining effort should fail validation for an open task. This is more honest than preserving an arbitrary amount while claiming the result represents current work. Completed tasks require zero or no remaining-effort entry and receive no future blocks.

Reflection action should be deliberately narrow. A confirmed `DeferredTaskSignal` may be used only as a tie-break among otherwise equal affected tasks sent for new allocation. It must not displace a valid preserved block or outrank an earlier deadline. Estimation, workload, and difficult-topic signals remain informational because v0 lacks a justified mapping from them to effort, windows, or tasks.

The output should contain the revised full-period plan, `effective_at`, a version, typed modification events, ignored/non-actionable reflection signal kinds, and an objective churn summary. It need not duplicate the baseline plan: the caller already supplied it, and typed changes plus the revised plan are enough to audit the transition.

## Source modules inspected

- `.references/IntelliPlan/intelliplan/intelligence/rescheduling.py`
- `.references/IntelliPlan/intelliplan/intelligence/autopilot.py`
- `.references/IntelliPlan/intelliplan/intelligence/overrides.py`
- `.references/IntelliPlan/intelliplan/intelligence/planner.py`
- `.references/IntelliPlan/intelliplan/intelligence/robust.py`
- `.references/IntelliPlan/intelliplan/services/scheduling.py`
- `.references/IntelliPlan/tests/intelliplan/test_rescheduling.py`
- `.references/IntelliPlan/tests/intelliplan/test_planner_followthrough.py`
- `.references/IntelliPlan/tests/intelliplan/test_autopilot.py`
- `.references/IntelliPlan/tests/intelliplan/test_autopilot_due_changes.py`
- `.references/IntelliPlan/tests/intelliplan/test_overrides.py`
- `.references/IntelliPlan/tests/intelliplan/test_risk_and_robust.py`
