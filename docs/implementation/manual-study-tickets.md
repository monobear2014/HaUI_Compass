# Manual study tickets

Students can create tickets from Weekly plan or Today with **Create ticket**: title, owned assignment/course, effort (5–480 minutes), and notes. These are persisted domain tasks and support existing planning and execution tracking. New tickets appear in To do. The assignment supplies the deadline; creating a ticket does not submit it.

The authenticated `/ticket-board/tasks` endpoint checks workspace and assignment ownership. A stable UUID makes retrying creation idempotent. Task and notes share the existing transaction. No migration is required.

All four columns accept multiple tickets. The previous 100-entry board DTO constraint is removed. Starting another task selects its focus while preserving previous tickets in In progress. Focus is not a column capacity limit. Columns stretch to the same board height and have a larger drop area. Ticket details wait for board metadata before opening, so clicking immediately after navigation cannot expose an empty notes draft before saved notes arrive.

Validation: twelve manual tasks persisted in each column, idempotent retries, account isolation, PostgreSQL persistence across app instances, desktop/mobile creation and notes, reloads across four columns, three simultaneous In progress tickets, and mouse placement among multiple destination tickets. Existing keyboard/touch, cancellation, rollback, detail editing and execution checks pass.
