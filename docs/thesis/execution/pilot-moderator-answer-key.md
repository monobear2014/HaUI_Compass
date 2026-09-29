# Pilot Moderator Answer Key — Protocol v1.1

**Researcher-only; never show this document to participants.** Use the current structured backend output as the authoritative answer key. Before each session, reset the fixture, generate the baseline plan, retrieve the Next Best Action and its `reason_codes`/evidence, and save a de-identified snapshot reference under the participant ID. If the fixed fixture does not yield the expected output below, stop the session setup and resolve the fixture; do not coach around a mismatch.

## Frozen-fixture reference outcome

| Item | Expected outcome |
| --- | --- |
| T1 | Participant locates Academic Data and identifies at least three courses and two deadlines. |
| T2 | `Summarise two articles` is saved for Academic Skills / Reading response with 45-minute estimate and open state. The initial fixture has five assignments but only four study tasks; T2 creates the fifth. |
| T3 | A baseline weekly-plan revision is generated and blocks/unplanned work are viewable. |
| T4 | Next Best Action identifies `Solve graph exercises` for Algorithms / Problem Set 3. |
| T5 | Response is evaluated against the actual current recommendation output recorded below. |
| T6 | 45 minutes of partial execution are saved for the recommended/open task and it remains incomplete. |
| T7 | Reflection records less available study time than planned. |
| T8 | Participant confirms the shown matching constrained-time signal, or accurately records that it is absent. |
| T9 | After Tuesday 18:00–19:30 is unavailable, a revised plan is generated. |
| T10 | Participant locates baseline and revised revisions and answers the three plan-change prompts. |

## Structured backend answer key: complete before session

| Field | Expected / record actual frozen-fixture output |
| --- | --- |
| recommendation_task | Expected: `Solve graph exercises` |
| recommendation_reason_codes | Expected primary code: `high_assignment_risk`; copy the exact returned tuple |
| recommendation_risk_level | Expected: `HIGH` |
| recommendation_deciding_dimension | Expected: `risk`; copy returned value |
| recommendation_deadline / status / eligible count | Copy actual structured evidence |
| plan-change affected task(s) | Copy actual `PlanChange` task IDs/titles |
| plan-change reason codes | Expected relevant codes: `remaining_effort_changed` after partial execution and `study_window_changed` for blocks affected by the removed Tuesday window. Record `insufficient_capacity` only if the actual typed output contains it. |
| preserved/unchanged blocks | Copy actual unchanged/preserved or frozen blocks from revision comparison |

The typed backend result, rather than this prose, is the reference for coding. Never invent an explanation or add codes that were not returned.

## Success and failure rules

Apply the success/failure conditions in [pilot-participant-tasks.md](../pilot-participant-tasks.md). Success requires the specified observable saved/located/identified outcome. Failure includes a wrong required value, unsaved result, inability to locate the required evidence, or ending the task without the outcome. Mark stop/skip as abandoned and an unstarted task as not attempted. Technical incidents are not participant errors.

## Comprehension coding rules

For T5, ask “Why did the system recommend this task?” Compare the response to the actual `reason_codes` and evidence.

- **Correct:** identifies the decisive shown reason/fact and does not contradict it; for this fixture, high assignment risk for the Algorithms task is sufficient when it matches the returned evidence.
- **Partially correct:** identifies a relevant shown fact/reason but omits the decisive one, is too vague to verify, or has a minor non-contradictory error.
- **Incorrect:** gives no relevant shown reason, contradicts the output, identifies another task/reason, or says they do not know.

For T10, code each response (“what changed?”, “why?”, “what remained unchanged?”) against actual displayed revisions and `PlanChange` codes using the same three labels. Correct answers identify the affected task/block or preserved/frozen work and a shown factual code. Do not use an LLM judge. If two coders are used, preserve both codes and reconcile against this rule set.
