# Companion workbench

The student workspace now has a collapsible left navigation, central work area,
and independently closable right assistant. Desktop navigation collapses to icons;
small screens use overlays. Layout preferences persist on the device, with Escape
and accessible toggle buttons. Private document Q&A docks into the same right
panel; users can switch back to the general study companion without a duplicate
chat column.

## Bounded multi-agent orchestration

The backend uses a custom supervisor and role-specific Planner, Study Coach,
Reflector and grounded Tutor agents. A reflection-and-planning request executes
Reflector then Planner with an explicit handoff. This is bounded orchestration,
not a LangGraph integration. Agent tools read authenticated server-side facts;
chat cannot approve plans, submit work or save memories automatically. Existing
academic-integrity checks run before delegation. Tutor answers use registered
courseware citations; missing evidence and provider fallback are labelled.

## Personal memory

Students explicitly confirm up to 20 editable memories. The online PostgreSQL
repository isolates memories and exchanges by owner and preserves them across
process restarts. The panel loads the latest 30 exchanges; bounded recent context
and confirmed self-reports personalize responses. Memory is untrusted context,
never a source citation or permission to bypass integrity rules. Students can
clear history separately from deleting memories. Lecturer endpoints cannot read
this student-only feature.

Migration: `0007_companion_memory` after `0006_learning_preferences`.

Validation includes specialist handoff, read-only behavior, idempotent retries,
account isolation, durable PostgreSQL storage, explicit confirmation and mobile /
desktop layout controls. Online AI availability remains configuration-dependent;
template fallbacks are not represented as model-generated answers.
