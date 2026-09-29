# Supervisor Review Summary: HaUI Compass Controlled Pilot

## Thesis objective

Evaluate whether the technically validated HaUI Compass MVP is usable and perceived as useful in a controlled, short session with university students. The study evaluates the Plan → Do → Reflect → Adapt workflow using fictional data; it does not evaluate academic achievement or long-term outcomes.

## Research questions

- **RQ1:** Can students complete the core Academic Data → Plan → Do → Reflect → Adapt workflow?
- **RQ2:** Does Next Best Action help participants identify what to work on next?
- **RQ3:** Are recommendation reasons and adaptive-replanning changes understandable and useful?
- **RQ4:** How usable is the prototype for university students?
- **RQ5:** What workflow or usability problems remain before a larger pilot?

## Hypotheses

- **H1:** Participants complete core workflow tasks with a high task-completion rate.
- **H2:** Participants rate Next Best Action as useful for prioritising study work.
- **H3:** Participants can correctly or partially correctly explain recommendation prioritisation after viewing structured reasons/evidence.
- **H4:** Participants rate the revised plan as useful after a controlled execution/capacity change.

These are descriptive pilot hypotheses; none concerns GPA, learning gain, retention, or long-term behaviour.

## Study design

A moderated controlled usability/pilot session has five phases: orientation; a common fictional academic scenario; independent task completion; questionnaires; and a short semi-structured interview. The facilitator records observations without coaching. Technical validation evidence is reported separately from participant outcomes.

## Participants

Include university students able to use a web application and provide informed consent; HaUI enrolment is not required. Exclude prior participants and project researchers/developers. The minimum practical pilot target is **5** participants; the preferred target is **10–15** participants.

## Participant tasks

| Task | Activity |
| --- | --- |
| T1 | Inspect fictional Academic Data. |
| T2 | Create a specified study task. |
| T3 | Generate a weekly plan. |
| T4 | Identify the Next Best Action on Today. |
| T5 | Explain why that task was recommended. |
| T6 | Record 45 minutes of partial work. |
| T7 | Complete a constrained-time reflection. |
| T8 | Confirm the matching reflection signal, if shown. |
| T9 | Apply a controlled unavailable-study-window change and replan. |
| T10 | Compare revisions in History and explain changes. |

The reproducible fixture has three courses, five assignments, overlapping deadlines, 6.5 hours capacity, high/medium risk, partial completion, reflection, and replanning.

## Objective metrics

Record task completion rate, time on task, error count, assistance count, workflow abandonment, navigation mistakes, recommendation-reason comprehension, and plan-change comprehension. Each uses a task-level numerator/denominator or timestamped/event-log definition; no composite pilot score is calculated.

## Questionnaires

Administer the unmodified System Usability Scale (SUS) and score/report it separately. Custom 5-point Likert items assess Next Best Action usefulness, explanation clarity, weekly-plan usefulness, reflection usefulness, replanning usefulness/clarity, conditional trust, and workload. Free-text prompts capture missing information and feature concerns.

## Comprehension evaluation

For T5, ask why the system recommended the displayed task and compare the response with the actual shown structured reason codes/evidence. For T10, ask what changed, why, and what remained unchanged; compare answers with actual PlanChange records/reason codes. Code answers as correct, partially correct, incorrect, or missing using a deterministic manual codebook. No LLM judge is used.

## Data collected

Collect only anonymous participant ID, session/task outcomes and durations, UI errors, navigation/assistance/abandonment events, questionnaire responses, comprehension responses/codes, interview notes, and technical-incident notes. The repository contains only a field template, never participant records.

## Consent and privacy

Participation is voluntary; participants may skip questions/tasks or stop without consequence or grade effect. The study uses fictional data and requires no HaUI/LMS credentials. Consent records are separated from pseudonymised analysis data. Passwords, student IDs in the analysis dataset, real academic records, financial information, and health information are not collected. Storage, access, retention, and secure deletion are set before recruitment. Ethics/supervisor status is explicitly **TO BE CONFIRMED**.

## Analysis method

Use descriptive pilot analysis: n/N and percentages for outcomes/comprehension; median and range/IQR for time and event counts; Likert distributions and medians; and separate SUS reporting. Use simple thematic coding of interview notes for navigation, recommendation clarity, planning usefulness, trust, reflection friction, and replanning clarity. Do not use significance testing without a pre-specified justified design.

## Threats to validity

Small convenience sample, fictional workload, short duration, novelty effect, self-report bias, no real HaUI LMS integration, no academic-outcome measurement, and prototype/demo rather than production identity limit interpretation. The controlled fixture and mixed behavioural/self-report evidence mitigate some variation but do not remove these limits.

## Claim boundaries

If supported, the thesis may claim that the prototype is technically functional (from separate engineering evidence), that this sample completed specified tasks, that participants perceived features as useful/clear, and that deterministic recommendation/replanning behaviour was explainable to the measured extent. It must not claim improved GPA, learning outcomes, dropout, long-term behaviour, production readiness, or official HaUI LMS integration.

## Decisions Needed From Supervisor

Please approve or provide feedback on:

- Research questions RQ1–RQ5.
- Hypotheses H1–H4 and their descriptive pilot framing.
- Participant target: minimum 5 and preferred 10–15.
- Participant eligibility criteria.
- The controlled fictional scenario and its use instead of real academic data.
- Use of the unmodified SUS.
- Custom Likert questions.
- Semi-structured interview questions.
- Participant-information and consent wording.
- Required retention period and secure deletion method.
- Whether ethics or institutional approval is required before recruitment.
- Whether statistical testing is expected beyond the planned descriptive analysis.
- Thesis claim boundaries.
