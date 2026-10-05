# Council Demo v0.5 — Canonical Runbook

## Purpose and boundary

This is the one 4–6 minute fictional-data demonstration for a council. It shows transparent
deterministic decisions, bounded AI assistance, and adaptation that does not silently replace a
plan. It is not a HaUI LMS integration, student-outcome study, or production-readiness claim.

The canonical close is: **Plan → Execute → Reflect → Adapt → Plan Again**.

## Before the room

Start the in-memory demo. The offline path is the default and needs neither a credential nor
network.

```bash
cd apps/api
uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001
```

```bash
cd apps/web
COMPASS_API_URL=http://127.0.0.1:8001 npm run dev
```

Open `http://127.0.0.1:3000`. If it is occupied, do not kill the other process. Run
`COMPASS_API_URL=http://127.0.0.1:8001 npm run dev:3100` and open `http://127.0.0.1:3100`.

Before presenting, run:

```bash
cd apps/api
uv run --extra dev python -m haui_compass.api.demo_preflight
```

Offline expected status is `READY FOR DEMO`; it reports `LLM enabled ... PASS: NO; offline mode`,
`Credential ... SKIPPED: NOT REQUIRED`, and deterministic fallback PASS. No API key is printed.
A credential warning still permits an offline demo; a FAILURE should be fixed before presenting.

For a prepared online variant only, set server-side variables, restart the API, and make the
provider probe explicit:

```bash
export HAUI_COMPASS_LLM_ENABLED=true
# Load a real secret from your secure shell/secret manager; never paste it into this runbook.
export OPENAI_API_KEY="$YOUR_SERVER_SIDE_OPENAI_KEY"
cd apps/api
uv run --extra dev uvicorn haui_compass.api.demo:app --host 127.0.0.1 --port 8001
uv run --extra dev python -m haui_compass.api.demo_preflight --live-provider-check
```

If this warns or fails, restart in offline mode and present the same full flow. Never put the key
in frontend variables, source files or slides.

## Presenter script (about five minutes)

### A. AI-assisted task decomposition — 75 seconds

1. Select **Normal Week**, then **Academic Data**. Say: “Every name, assignment and date here is
   fictional; this fixture is reproducible.”
2. Find **Databases / Database Mini Project**, initially with no confirmed study tasks. Click
   **Suggest tasks with AI**.
3. Point to provenance: **Template · offline** by default or **AI · online** after a successful
   verified live call. Say: “These are bounded study-step candidates, not a task or a submission.”
4. Change candidate 1 to `Clarify rubric and project scope`, estimate `40`, and uncheck candidate 2.
5. Click **Add selected tasks**. Show that exactly three created task facts are named.

Say: “AI only suggests. The student edits and confirms. Before confirmation, candidates are
ephemeral and cannot affect risk, recommendation or planning.”

Fallback: a template badge is correct offline behavior. Continue with the same edits and
confirmation; the demo does not require a live model.

### B. Deterministic decision — 60 seconds

1. Select **Deadline Crunch**, then open **Today → Risk & next action**.
2. Show **Draft the relational schema**, **HIGH RISK**, and the natural-language explanation.
3. Open **Decision evidence** and point to `deciding_dimension = risk`,
   `effort_exceeds_capacity`, 150 minutes remaining effort and 60 minutes capacity.
4. Expand **Regression Lab** in assignment risk to show **MEDIUM** and `low_slack`.

Say: “Risk and recommendation were calculated before language generation. The model can only
verbalize facts; it cannot change the recommended task, risk level, deadline or capacity.”

### C. Planning — 45 seconds

1. Click **Weekly Plan**.
2. Show study blocks, authored capacity, and **Needs attention**.
3. Point out the 195 unplanned minutes.

Say: “The planner keeps insufficiency visible. It never invents time or hides work that will not
fit.”

### D. Adaptation — 90 seconds

1. Select **Disrupted Week**. In **Today**, record the first task as completed from
   `2026-10-05T00:00` to `2026-10-05T00:25`.
2. For the new Regression Lab next action, record **Partial** work from
   `2026-10-05T00:30` to `2026-10-05T02:00`.
3. Open **Reflect**. Select Regression Lab, choose **Too heavy**, enter
   `Regression assumptions`, then **Review reflection**. Show the factual “estimated 60 min →
   recorded 90 min” candidate. Select the desired signals and **Save confirmed reflection**.
4. Open **Weekly Plan** → **Adjust & replan**. Set Regression Lab remaining minutes to `90`,
   click **Remove study window 2**, then **Create revised plan**.
5. In **Plan updated**, show **Task completed**, **Remaining effort changed**, **Study window
   changed**, then expand **Blocks kept unchanged**.
6. Open **History**, show revisions 1 and 2, then click **Reset this scenario**.

Expected reset: one initial revision, original task states, and no ability to confirm an old
candidate session. Say: “Observed execution, confirmed reflection and explicit remaining effort
inform a replan that preserves valid blocks. Plan → Execute → Reflect → Adapt → Plan Again.”

## Answers to likely council questions

| Question | Accurate response |
| --- | --- |
| Does AI decide priority? | No. Risk, NBA ordering, planning and replanning are deterministic. AI only returns validated language/candidates. |
| Can AI create tasks? | No. Only an edited, selected, explicitly confirmed candidate becomes a durable task fact. |
| Can the demo run offline? | Yes. The deterministic template fallback implements the complete flow with no network. |
| Is 25% slack a prediction? | No. It is a transparent MVP heuristic, not validated against student outcomes. |
| Is this production-ready? | No. It is in-memory, fictional and development-only; authentication, real LMS and outcome evidence are absent. |

## Reset between presenters

Select the target scenario again or click **Reset this scenario**. The demo atomically replaces its
container, clearing confirmed tasks, executions, reflection signals, plan revisions and unconfirmed
candidate sessions from the old generation. A golden-flow regression test verifies this boundary.
