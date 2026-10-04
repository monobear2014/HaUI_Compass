# AI Task Decomposition v0.3

## Demo purpose

Show that AI can turn a large fictional assignment into candidate actions while the student retains
control. Only confirmed edits become task facts. Risk, Next Best Action and Weekly Planner remain
deterministic consumers of those facts.

The showcase uses the deterministic offline provider. It requires no API key or network access.

## Exact presenter flow

1. Start the demo API and web app using the commands in
   [Demo Showcase v0.2](demo-showcase-v0.2.md#chuẩn-bị).
2. Select **Normal Week**.
3. Open **Academic Data** and find **Databases / Database Mini Project**. This assignment starts
   with “No confirmed study tasks yet.”
4. Click **Suggest tasks with AI**.
5. Point out four candidates, their editable estimates/rationales and the **Demo fallback** badge.
6. Explain the notice: “AI suggestions are not added until you confirm.” At this point the task
   repository and deterministic learning loop are unchanged.
7. Change candidate 1 to `Clarify rubric and project scope` and its estimate to `40` minutes.
8. Uncheck candidate 2, leaving three selected candidates.
9. Click **Add selected tasks**. The confirmation message names the three task facts that were
   created. The unchecked candidate is absent.
10. Open **Today**. One confirmed Database Mini Project task is now the deterministic NBA because
    that fictional assignment has the earliest deadline.
11. Open **Weekly Plan**, click **Adjust & replan**, inspect the three new remaining-effort inputs,
    then click **Create revised plan**.
12. Show the new tasks in revision 2 and open **History** to retain the initial plan separately.

## Expected data flow

| Stage | Data status | Can affect planning? |
|---|---|---|
| Provider response | Untrusted suggestion | No |
| Validated candidate session | Ephemeral suggestion with server-issued ID | No |
| User-edited selected candidate | Confirmation request, validated against session | No, until accepted |
| Created `Task` | Student-confirmed fact through `CreateStudyTask` | Yes |
| Risk/NBA/plan output | Deterministic decision and evidence | Yes, as derived output |

The provider receives assignment ID/title/deadline and course name/code. No description is sent
because the current LMS/domain model does not contain one. Suggested estimates are editable and are
not presented as ground truth.

## Failure demonstration

Automated tests cover provider timeout, exception, malformed shape, empty output, more than five
candidates, invalid title/duration and duplicate titles. Every provider failure falls back to the
same four offline candidates. If the fallback itself violates the contract, generation fails rather
than persisting partial or fabricated tasks.

## Boundaries and limitations

- No vendor LLM adapter or real API call is configured in v0.3.
- Candidate sessions are in-memory and reset with the selected scenario.
- There is no authentication, production expiry policy or cross-process candidate session store.
- The provider suggests steps only; it does not write graded answers or submission artifacts.
- Confirmed estimates are student choices, not predictive estimates or validated ground truth.
- AI does not calculate risk, select the NBA, create study windows or schedule tasks.
- No production readiness or improved learning outcome is claimed.
