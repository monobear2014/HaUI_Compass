# Pilot Data Collection Template

This is a field definition template only. Do not place real participant data in the repository.

## Session metadata

| Field | Definition / allowed value |
| --- | --- |
| participant_id | Random study ID; no name or student ID |
| session_date | Date only, if approved by retention plan |
| facilitator_id | Researcher code, not participant identity |
| scenario_fixture_version | Version/hash of fictional study fixture |
| consent_recorded | yes / no; store consent separately |
| technical_incident | none / short de-identified description |
| session_status | completed / withdrawn / interrupted |

## Task observation row (one row per task)

| Field | Definition / allowed value |
| --- | --- |
| participant_id | Random study ID |
| task_id | T1–T10 |
| start_time / end_time | Study timestamps; calculate duration separately |
| technical_pause_seconds | Exclude from task duration; zero if none |
| outcome | success / failure / abandoned / not attempted |
| error_count | Non-negative integer |
| navigation_mistake_count | Non-negative integer |
| assistance_count | Non-negative integer |
| assistance_type | reread instruction / technical restoration / other documented neutral aid |
| observation_note | Brief de-identified factual note |

## Comprehension row

| Field | Definition / allowed value |
| --- | --- |
| participant_id | Random study ID |
| prompt | T5 why-recommended / T10 what-changed / why-changed / unchanged |
| verbatim_or_close_response | De-identified response |
| answer_key_version | Captured structured reasons/evidence or PlanChange records |
| primary_code | correct / partially correct / incorrect / missing |
| secondary_code | Optional independent code before reconciliation |
| final_code | Reconciled deterministic/manual code |
| coding_note | Rule applied; no LLM judgement |

## Questionnaire and interview row

| Field | Definition / allowed value |
| --- | --- |
| participant_id | Random study ID |
| instrument/item_id | SUS item 1–10 or custom item ID |
| response | 1–5 / prefer_not_to_answer / missing |
| sus_score | Standard score if complete; otherwise missing |
| free_text_response | De-identified text |
| interview_note_id | De-identified note reference |
| theme_code | navigation / recommendation clarity / planning usefulness / trust / reflection friction / replanning clarity / other |
