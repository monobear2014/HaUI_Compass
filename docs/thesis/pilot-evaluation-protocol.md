# HaUI Compass Controlled Thesis Pilot Protocol v1.3

**Status: FROZEN FOR PILOT**
**Session duration: 30–45 minutes per participant**
**Participant plan: target 12; acceptable range 10–15; fewer than 10 is exploratory only**

## Purpose and scope

This protocol evaluates the usability and perceived usefulness of the HaUI Compass MVP in a short, controlled session. It evaluates an interaction with the prototype, not academic achievement, long-term behaviour, production readiness, or LMS integration. All participants use the same fictional academic scenario.

Existing engineering evidence is reported separately: MVP Benchmark v1, Pilot Import Evaluation v1 (23/23 PASS), PostgreSQL validation, frontend acceptance (14/14 PASS), and HTTP thesis scenario (16/16 PASS). Those artefacts support technical correctness and reproducibility; they are not user-study outcomes.

## Research questions

- **RQ1:** Can university students successfully complete the core Academic Data → Plan → Do → Reflect → Adapt workflow in the prototype?
- **RQ2:** Does Next Best Action help participants identify what to work on next?
- **RQ3:** Are recommendation reasons and adaptive-replanning changes understandable and useful to participants?
- **RQ4:** How usable do university students perceive the prototype to be?
- **RQ5:** What workflow or usability issues should be addressed before a larger pilot?

## Hypotheses

- **H1:** Participants complete the core workflow tasks with a high task-completion rate, reported with raw numerator/denominator.
- **H2:** Participants rate Next Best Action as useful for prioritising study work on a post-task Likert item.
- **H3:** After seeing structured recommendation reasons/evidence, participants can explain the prioritisation correctly or partially correctly more often than incorrectly.
- **H4:** Participants rate the revised plan as useful after a controlled execution/capacity change.

“High”, “useful”, and the H3 comparison are descriptive pilot targets, not preregistered pass/fail thresholds. No hypothesis concerns GPA, learning gain, retention, or long-term behaviour.

## Design and session procedure

This is a moderated, controlled usability/pilot study with one 30–45 minute session per participant and five phases: (A) orientation, (B) fictional scenario briefing, (C) independent task performance, (D) questionnaire, and (E) a short semi-structured interview. The researcher uses the task sheet and records observations without coaching.

1. Give participant information, obtain consent, and assign an anonymous ID.
2. Give a 3–5 minute neutral product introduction: pages available and how to use ordinary controls; do not reveal task answers or reasons.
3. Provide the fictional scenario and task sheet. Verify the participant may stop at any time.
4. Run T1–T10 in order. Record completion, timestamps, observable errors, navigation mistakes, abandonment, and assistance. Read a task again if requested; record this as assistance. Do not explain a feature, recommend a click, or correct an answer until the task is ended.
5. Ask the specified post-task questions and comprehension prompts before revealing answers.
6. Administer the unmodified SUS separately, then the custom items.
7. Conduct the interview, debrief, and explain that the data were fictional.

For technical failure, pause the timer, document the incident, restore the known study state, and repeat only the affected task. The incident is not counted as participant error. A participant may skip or stop any task; record it as abandoned/withdrawn rather than infer a result.

## Participants

Inclusion criteria are university students aged 18 or older who have basic web-application familiarity and can provide informed consent. HaUI enrolment is not required. Exclude people directly involved in developing HaUI Compass and people who have already participated in this exact study.

Recruit a **target of 12 participants**, with an acceptable range of **10–15**. Fewer than 10 participants constitutes an exploratory pilot only. Report the achieved number and recruitment method; do not claim population representativeness.

## Canonical fictional scenario

Use a resettable study account and the exact scenario in [pilot-participant-tasks.md](pilot-participant-tasks.md). Its initial state has four courses, five assignments, and four study tasks: the Academic Skills assignment exists but has no study task until T2. T2 explicitly creates the fifth study task. The scenario has overlapping deadlines, 5.0 hours of study capacity, a high-risk and a medium-risk assignment, an in-progress task, a reflection, and a subsequent capacity change. The canonical StudyWindows are authoritative; total study capacity is derived from them and is not independently editable. It exercises Academic Data → Create Study Task → Weekly Plan → Today → Record Execution → Reflection → Confirm Signal → Adaptive Replan → History. No real student data, accounts, LMS data, or credentials are needed.

## Recommendation and replanning comprehension

The researcher prepares an answer key from the system's actual structured output immediately before each session. For Next Best Action, record the shown task, `reason_codes`, risk evidence, deadline, status, and deciding dimension. Ask: “Why did the system recommend this task?” Code the answer as:

- **Correct:** identifies the decisive shown reason/fact and does not contradict it (for example, high assignment risk or earliest deadline, plus the corresponding task).
- **Partially correct:** identifies a relevant shown reason/fact but omits the decisive one, is too vague to verify, or includes a minor non-contradictory error.
- **Incorrect:** supplies no relevant shown reason, names a contrary reason/task, or says they do not know.

After replan, ask: “What changed? Why did it change? What remained unchanged?” Compare answers with the displayed plan revisions and actual `PlanChange` reason codes. Code each of the three prompts correct/partial/incorrect using the same principles. A correct answer must identify the affected task/block or unchanged preserved/frozen work and a shown factual reason such as `remaining_effort_changed`, `study_window_changed`, or `insufficient_capacity`. Two named researchers independently code an initial subset when feasible, reconcile discrepancies with a written codebook, and retain both original responses. No LLM judge is used.

## Data collection and privacy boundary

Collect only pseudonymous participant IDs (`P01`, `P02`, …), task outcomes/durations, UI errors, navigation mistakes, assistance and abandonment events, questionnaire answers, comprehension responses/codes, interview notes, and technical-incident notes. Use the field-only template in [pilot-data-collection-template.md](pilot-data-collection-template.md).

Do not collect passwords, HaUI/LMS credentials, names in the analysis dataset, student IDs, financial or health information, or real academic records. Retain raw/pseudonymous study data for six months after thesis/project completion, then delete it. Aggregated anonymized results may remain in the thesis/project report.

## Threats to validity

| Threat | Mitigation / interpretation |
| --- | --- |
| Small convenience sample | Report recruitment and raw descriptive results; do not generalise to all students. |
| Controlled fictional workload | Standardises comparisons but may not represent personal complexity; future work may test voluntary manual entry of participants' own data. |
| Short session | Measures immediate interaction only, not continued use. |
| Novelty effect | Ask interview questions about likely real use; interpret self-report cautiously. |
| Self-report bias | Combine questionnaires with observed behaviour and open-ended responses. |
| No real HaUI LMS integration | State that import is controlled/manual and make no integration claim. |
| No academic-outcome measurement | Make no performance, GPA, dropout, or learning-outcome claim. |
| Prototype/demo identity, not production authentication | Use a study account and do not infer production readiness or security. |

## Claim boundary

If results support them, the thesis may claim that the prototype is technically functional (from engineering evidence), that this sample could complete specified workflow tasks, that participants perceived specified features as useful/clear, and that deterministic recommendation/replanning behaviour was explainable to the measured extent.

It must not claim that HaUI Compass improves GPA, learning outcomes, dropout, long-term behaviour, or production readiness; nor that it has official HaUI LMS integration.

## Ethics and approval

**Minimal-risk personal usability pilot. Formal institutional ethics approval has not been obtained.** If an institution later requires ethics approval for formal thesis use, that approval must be obtained before collecting data under that institutional study.

## Change control

After the first participant session begins, any change to participant tasks, the canonical scenario, questionnaire, comprehension scoring, or primary metrics requires a protocol version bump. Do not silently mix data collected under different protocol versions.
