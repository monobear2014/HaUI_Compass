# Weekly and daily study tickets

The weekly board groups existing study tasks into Backlog, Planned, In progress
and Done. Cards expose course, parent assignment, deadline, estimate, approved
sessions and submission evidence. Search, course filtering, board/list views and
a detail dialog use the same authenticated tasks. Dragging to In progress selects
focus; dragging to Done opens the existing actual-time confirmation dialog.
Buttons provide equivalent actions for touch and keyboard users.

Today maintains an ordered selection of weekly tasks, a daily capacity and
per-task daily estimates. Approved sessions for the current Hanoi day supply the
initial selection and planned duration. Students can change their selection,
reorder it and see workload against capacity. Logged time is read from persisted
execution records and clipped to that day. Finishing a ticket uses the existing
execution API; it never fabricates an LMS submission or changes approved time
blocks. Approved schedule changes still go through review and approval.

Daily organization is stored in PostgreSQL (`0008_ticket_boards`) per account,
workspace generation and Hanoi day. Version checks reject stale writes from other
tabs. Unknown tasks, another account's scope, invalid focus and duplicate IDs are
rejected. Starting focus records intention, not a study execution. Partial work
and completion require reported actual minutes.

## Research boundary

REA opened the official public documentation for Jira Kanban and Sunsama daily
planning in temporary owned browser processes. It did not inspect either product's
private application, source code or authenticated customer data. Evidence IDs and
coverage are recorded in `ticket-board-research.json`.

References:
- https://support.atlassian.com/jira-software-cloud/docs/monitor-work-in-a-kanban-project/
- https://help.sunsama.com/docs/usage-guides/daily-planning/

The implementation adapts status cards, explicit daily selection and workload
comparison to the existing Plan–Do–Reflect domain. It is not an integration with
Jira or Sunsama.
