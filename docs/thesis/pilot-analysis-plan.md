# Pilot Analysis Plan

## Timing and unit of analysis

Define this plan before data collection. The unit is a participant-task observation for task metrics and a participant for questionnaires/interviews. Analyse only consented participants. Retain withdrawals only to the extent covered by consent and label incomplete sessions clearly.

## Objective metrics

| Metric | Numerator | Denominator | Unit | Collection |
| --- | --- | --- | --- | --- |
| Task completion rate | Tasks completed successfully | Attempted tasks with a recorded outcome | % (also n/N) | Researcher task log |
| Time on task | End timestamp − start timestamp; exclude documented technical pauses | Each attempted task | seconds/minutes | Timestamped task log |
| Error count | Participant errors under task-sheet definition | Each attempted task (and total/session) | count | Observer event log |
| Assistance count | Researcher assistance events, including rereading task | Each attempted task (and total/session) | count | Observer event log |
| Workflow abandonment | Started tasks not completed because participant stops/skips | Started tasks | % (also n/N) | Task outcome log |
| Navigation mistakes | Recorded off-path actions under task-sheet definition | Each attempted task (and total/session) | count | Observer event log |
| Recommendation-reason comprehension accuracy | Responses coded correct / partial / incorrect | T5 responses with a code | category and % per category | Verbatim response + deterministic codebook |
| Plan-change comprehension accuracy | Correct / partial / incorrect codes for “what/why/unchanged” | Each non-missing T10 prompt response | category and % per prompt | Verbatim response + PlanChange answer key |

Do not make a composite “pilot score.” Keep task-level results separate so a high rate cannot obscure failures in explainability or replanning.

## Quantitative reporting

For the small pilot, report n/N and percentage for completion/abandonment and comprehension categories; median and range (or IQR when informative) for time, errors, assistance, and navigation mistakes; and item-level Likert distributions with median. Report the standard SUS score only as a separate established-instrument result. Show missing responses and technical incidents. Prefer descriptive statistics; do not use significance tests unless a justified sample size, comparison, and pre-specified method are added before collection.

Map evidence to questions: RQ1 uses T1–T10 completion/time/errors; RQ2 uses the Next Best Action item and T4; RQ3 uses T5/T10 comprehension and clarity/replan items; RQ4 uses SUS and workload item; RQ5 uses error notes, free text, and interview themes. H1–H4 are assessed descriptively, with wording limited to the observed sample.

## Qualitative analysis

Transcribe or expand interview notes without identifiers. Two reviewers, where feasible, first independently apply short descriptive codes, then reconcile into recurring themes: navigation, recommendation clarity, planning usefulness, trust, reflection friction, and replanning clarity. Preserve a quote/note reference and task context for every theme. Count mentions only as context, not as a prevalence estimate. Record negative cases and uncertainty. No LLM is used to code comprehension or adjudicate themes.

## Reporting boundary

Report technical validation in a distinct section from participant results. Interpret findings as formative evidence from a controlled fictional scenario, not estimates of academic outcomes, real LMS workflow performance, population adoption, or production readiness.
