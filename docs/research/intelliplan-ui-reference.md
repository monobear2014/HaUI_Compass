# IntelliPlan UI Reference

Read-only source audit, 2026-09-28. Observations below come from actual templates/styles/scripts;
the IntelliPlan server was not run. No source, assets, icon paths, or literal design tokens are reused.

## Screens inspected

Dashboard, Scheduler, Priority View, Command Center/next action, My Stats, Profiles, Settings,
and the shared desktop/mobile navigation.

## Application shell

Application templates extend a common Jinja base. Desktop has a persistent collapsible sidebar;
content uses headers, card sections, and a primary/secondary column. Marketing and workspace
navigation share considerable shell code. Modern presentation includes translucent glass panels.

## Navigation

Sidebar links cover Dashboard, Scheduler, Active Study, Grades, Study & Learn and numerous secondary
destinations. Search and customization provide overflow navigation. Mobile replaces the rail with
a six-tab bottom bar and a focus-managed Menu sheet. HaUI needs only four visible destinations.

## Dashboard hierarchy

Greeting/date and actions precede four summary metrics. The main task list has Today/This week/
Overdue tabs; a secondary column contains schedule progress, grades, and upcoming work. HaUI puts
the next action first and moves supporting facts below it; unsupported GPA/streak metrics are omitted.

## Next-action presentation

The dedicated next-action card emphasizes a title, compact metadata, quiet reasons, and one filled
Start action. Risk and uncertainty are stated in text. Additional why/details are progressively
disclosed. Its script updates the recommendation through HTTP, with focus-aware hiding behavior.

## Planner presentation

Scheduler uses day cards and time blocks pairing clock ranges with title/course/duration. Creation
and results have separate tabs; capacity warnings list deferred work and its reasons. Small screens
wrap time labels and collapse layouts. HaUI uses grouped day columns with clear time/task/status
and a permanent Needs attention section. Generation and explicit replanning are forms, with no drag/drop.

## Task/assignment presentation

Priority cards show title, course, due date, priority badge and secondary metadata. Filters and search
help with large lists. Detail/completion dialogs avoid putting every control in each row. HaUI keeps
the title and supporting academic context, and uses a dedicated Record work form.

## Status and progress patterns

Text badges complement semantic color. Schedule progress has a bar plus a textual count. Loading
skeletons match final rows; empty states suggest a relevant next action; errors offer retry.
Statistics include completion/activity and grades, but these are not all supported by HaUI's API.

## Useful UX patterns

Persistent navigation, stable active state, one primary action, grouped day schedules, visible
unplaced work, short metadata rows, explicit error/retry feedback, and accessible focus behavior.

## Problems / outdated patterns

Many competing destinations and dashboard metrics add density. Template-local CSS and imperative
JavaScript coexist with multiple global responsive override layers. Blur, large radii, animated
cards and floating controls add visual weight. Profile mutations use page reloads. Comments describe
historical duplicate mobile navigation and time-label overflow problems; these are code evidence,
not claims from a live rendering. HaUI will use one responsive shell and simpler solid surfaces.

## HaUI Compass adaptations

Light neutral canvas, white panels, restrained forest-green accent, 6–12px radii, consistent spacing,
system typography, and small line icons drawn independently. Today highlights one next action.
Weekly Plan shows WHEN/WHAT/STATUS; reflection is a structured review with factual/self-reported
candidate badges and unchecked explicit selections. History is an append-only revision list.
Adaptation shows backend reasons and before/after plan records without invented explanations.

## Elements intentionally not copied

No HTML/Jinja, CSS declarations/tokens, JavaScript, icons, images, branding, fonts or other assets.
No tutor/chat, pets, streak gamification, grade modeler, integrations menu, command palette,
sidebar customizer, marketing navigation, scheduling algorithms, or proprietary confidence claims.

## Source files inspected

All paths below are relative to `.references/IntelliPlan`:

- `Main_Project/templates/base.html`
- `Main_Project/templates/dashboard.html`
- `Main_Project/templates/scheduler.html`
- `Main_Project/templates/priority.html`
- `Main_Project/templates/command_center.html`
- `Main_Project/templates/my_stats.html`
- `Main_Project/templates/profiles.html`
- `Main_Project/templates/settings.html`
- `Main_Project/templates/_app_tabbar.html`
- `static/css/next_action.css`
- `static/css/ip-sidebar-rail.css`
- `static/css/ip-app-shell.css`
- `static/css/mobile.css`
- `static/js/next_action.js`
- `static/js/ip-app-shell.js`
