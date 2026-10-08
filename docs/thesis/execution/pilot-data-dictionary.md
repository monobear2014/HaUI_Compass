# Pilot Data Dictionary — Protocol v1

No aggregate “AI score” is created. Store raw/pseudonymous records only in ignored `research-data/`; retain for six months after thesis/project completion, then delete raw data.

| Field name | Meaning | Type | Allowed values | Unit | Source | Collection |
| --- | --- | --- | --- | --- | --- | --- |
| participant_id | Pseudonymous participant identifier | string | `P01`–`P15` | n/a | Assigned by researcher | directly observed |
| session_date | Session calendar date | date | ISO 8601 date | date | Observation sheet | directly observed |
| session_start_time | Session start | time | local time with timezone | timestamp | Observation sheet | directly observed |
| session_end_time | Session end | time | local time with timezone | timestamp | Observation sheet | directly observed |
| task_id | Protocol task identifier | string | `T1`–`T10` | n/a | Protocol | directly observed |
| task_outcome | Result of attempted task | categorical | success / failure / abandoned / not_attempted | n/a | Observation sheet | directly observed |
| task_success | Success indicator | boolean | true / false / missing | n/a | Derived from task_outcome | derived |
| task_start_time | First task-directed action | time | local time with timezone | timestamp | Observation sheet | directly observed |
| task_end_time | Last task-directed action | time | local time with timezone | timestamp | Observation sheet | directly observed |
| technical_pause_seconds | Time excluded for technical failure | integer | ≥ 0 | seconds | Observation sheet | directly observed |
| duration_seconds | Net task time | integer | ≥ 0 | seconds | task timestamps minus technical pauses | derived |
| error_count | Participant errors for one task | integer | ≥ 0 | count | Observation sheet | directly observed |
| navigation_mistake_count | Off-path actions for one task | integer | ≥ 0 | count | Observation sheet | directly observed |
| assistance_count | Neutral researcher assistance events | integer | ≥ 0 | count | Observation sheet | directly observed |
| abandonment | Participant stopped/skipped task | boolean | true / false | n/a | Observation sheet | directly observed |
| observer_note | Factual event note | text | de-identified text | n/a | Observation sheet | directly observed |
| recommendation_comprehension | T5 comprehension code | categorical | correct / partially_correct / incorrect / missing | n/a | Manual coding against actual reason codes | derived |
| replan_what_changed_comprehension | T10 “what changed” code | categorical | correct / partially_correct / incorrect / missing | n/a | Manual coding against PlanChange | derived |
| replan_why_changed_comprehension | T10 “why” code | categorical | correct / partially_correct / incorrect / missing | n/a | Manual coding against PlanChange | derived |
| replan_unchanged_comprehension | T10 “unchanged” code | categorical | correct / partially_correct / incorrect / missing | n/a | Manual coding against revision evidence | derived |
| recommendation_reason_codes | Actual output used as T5 key | array[string] | backend-returned codes only | n/a | Backend fixture snapshot | directly observed |
| plan_change_reason_codes | Actual output used as T10 key | array[string] | backend-returned codes only | n/a | Backend fixture snapshot | directly observed |
| sus_item_1 … sus_item_10 | Standard SUS item responses | integer | 1–5 / missing | Likert response | Questionnaire | directly observed |
| sus_total | Standard SUS total | number | 0–100 / missing | score | Standard SUS scoring | derived |
| likert_recommendation_usefulness | Custom NBA-usefulness response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_explanation_clarity | Custom explanation-clarity response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_weekly_plan_usefulness | Custom weekly-plan response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_reflection_usefulness | Custom reflection response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_replan_usefulness | Custom replanning-usefulness response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_replan_clarity | Custom replan-clarity response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_conditional_trust | Custom trust response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| likert_workload | Custom workload response | integer | 1–5 / prefer_not_to_answer / missing | Likert response | Questionnaire | directly observed |
| open_response | Free-text questionnaire response | text | de-identified text / missing | n/a | Questionnaire | directly observed |
| interview_note | De-identified interview note | text | de-identified text / missing | n/a | Interview | directly observed |
| theme_code | Qualitative coding label | categorical | navigation / recommendation_clarity / plan_usefulness / trust / reflection_friction / replanning_clarity / other | n/a | Manual thematic coding | derived |
