# Pilot Participant Tasks and Canonical Scenario — Protocol v1

**Status: FROZEN FOR PILOT**
**One moderated session: 30–45 minutes**
**Participant plan: target 12; acceptable range 10–15; fewer than 10 is exploratory only**

## Controlled scenario card

Use a fresh fictional account for every participant. The facilitator enters or resets the following data before the timed tasks; T1 verifies that the participant can inspect it, rather than making data-entry speed a confound.

| Course | Assignment / deadline | Study task / estimate / starting state |
| --- | --- | --- |
| Algorithms | Problem Set 3, Wed 17:00 | Solve graph exercises — 120 min — open |
| Databases | ER-model report, Thu 12:00 | Draft ER diagram — 90 min — open |
| Machine Learning | Quiz revision, Tue 17:00 | Review regularisation notes — 60 min — in progress, 20 min already recorded |
| Machine Learning | Mini-project outline, Fri 17:00 | Write project outline — 90 min — open |
| Academic Skills | Reading response, Thu 17:00 | Summarise two articles — 45 min — open |

Planning period: Monday–Friday of the session week. Available windows total 6.5 hours: Mon 18:00–19:30, Tue 18:00–19:30, Wed 18:00–20:00, Thu 18:00–19:30. Configure the Algorithms assignment as high risk and Databases as medium risk in the known study fixture. The exact displayed Next Best Action and structured evidence are recorded in the session answer key, not presumed from prose.

Controlled change: after T6, the participant records 45 minutes of partial work on the recommended/open task. Before T9, the facilitator applies the predefined change: the Tue 18:00–19:30 study window is no longer available. The participant completes a reflection, confirms the shown “limited available study time” signal if offered by the fixture, and replans. This makes execution, reflection/confirmation, and capacity change visible without claiming that reflection itself changes the v0 schedule.

## Task protocol

| ID | Participant instruction | Success condition | Observable failure condition | Data recorded |
| --- | --- | --- | --- | --- |
| T1 | “Open Academic Data and tell me which courses and assignments are available.” | Correctly locates data and identifies at least 3 courses and 2 deadlines. | Cannot locate it, reports absent/incorrect data, or abandons. | success, start/end, errors, navigation mistakes, assistance, abandonment |
| T2 | “Create the study task **Summarise two articles** for Academic Skills with the scenario estimate and deadline.” | Task is saved with the specified course, assignment, estimate, and open state. | Missing/wrong required field, duplicate/unsaved task, abandonment. | same + field errors |
| T3 | “Generate a weekly plan using the available study windows.” | A plan revision is generated and its blocks/unplanned work can be opened. | No plan, wrong period/input, repeated invalid attempt, abandonment. | same |
| T4 | “On Today, identify the task the system says to work on next.” | Identifies the displayed Next Best Action task. | Identifies another task or cannot find it. | same |
| T5 | “Using the evidence shown, why did the system recommend that task?” | Gives a response codeable against current structured reasons/evidence. | No response, contradictory explanation, or abandonment. | verbatim response, answer-key reasons/evidence, comprehension code |
| T6 | “Record 45 minutes of partial work on the recommended/open task; do not mark it complete.” | Execution record is saved for the intended task and task remains incomplete. | Wrong task/duration/status, unsaved record, abandonment. | same + record details |
| T7 | “Complete the reflection using the scenario: you had less time available than planned.” | Reflection is submitted with the specified constrained-time content. | Cannot find/submit reflection, irrelevant entry, abandonment. | same |
| T8 | “Review the reflection insight and confirm the signal that matches the scenario, if shown.” | Correct shown signal is confirmed, or participant documents that it is absent. | Confirms contradictory signal, cannot locate control, abandonment. | same + signal shown/selected |
| T9 | “Tuesday evening is no longer available. Replan the remaining week.” | Revised plan is generated after applying the predefined unavailable window. | Change not applied, no revised plan, invalid/repeated attempt, abandonment. | same + plan revision IDs, shown PlanChange reasons |
| T10 | “In History, compare the original and revised plans. What changed, why, and what stayed the same?” | Locates both revisions and gives responses codeable against change records. | Cannot locate revisions, no interpretable response, abandonment. | same + three verbatim responses and codes |

An error is an action producing an invalid state, an incorrect required value, or an unnecessary recovery caused by the participant. A navigation mistake is entering a page/control that does not advance the current task, excluding deliberate exploration and researcher-directed navigation. Record each observable event once with a short note.

After the first participant session begins, changes to these tasks or the canonical scenario require a protocol version bump; do not silently mix datasets.
