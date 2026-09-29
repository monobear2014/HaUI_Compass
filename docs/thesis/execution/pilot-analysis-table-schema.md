# Blank Analysis-Ready Table Schema — Protocol v1

This schema is blank: do not add participant data to the repository.

## `participant_summary`

| participant_id | sus_total | likert_recommendation_usefulness | likert_explanation_clarity | likert_weekly_plan_usefulness | likert_reflection_usefulness | likert_replan_usefulness | likert_replan_clarity | likert_conditional_trust | likert_workload |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | |

## `task_observations`

| participant_id | task_id | task_outcome | task_success | duration_seconds | error_count | assistance_count | navigation_mistake_count | abandonment |
| --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | |

## `comprehension`

| participant_id | prompt | comprehension_code | answer_key_reference |
| --- | --- | --- | --- |
| | | | |

Use one row per participant-task observation and one row per comprehension prompt. Derive reported completion, median durations, counts, comprehension distributions, SUS, and custom-Likert distributions only during analysis; do not calculate results in this template.
