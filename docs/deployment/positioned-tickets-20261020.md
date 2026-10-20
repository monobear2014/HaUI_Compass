# Positioned ticket dragging — 2026-10-20

Ready Preview: https://haui-compass-1kxo4ejua-nam-4b71.vercel.app

The board supports choosing before/after a card, reordering within a column and moving across columns. A pointer-following overlay and insertion line show the destination, while card slots stay stable during dragging. Neighbouring cards animate to their new positions after release. Mouse, touch hold and keyboard sensors are supported; Escape cancels without saving. The shell respects handled Escape events.

A validated `ticket_order` field stores the order independently of the Today selection. Writes remain account/workspace owned and use the existing version lock. Saves are optimistic, with rollback and an error message on failure. No database migration is required; this extends the existing JSON payload. Pointer coordinates used for insertion remain in viewport coordinates during auto-scroll.

TypeScript, ESLint, Ruff and production build passed. Ticket API checks passed (4), and PostgreSQL persistence across container instances passed (1). Desktop/mobile browser checks cover before/after placement, reload persistence, editing, actual study logging, touch, keyboard, cancellation and failed-save recovery. Online checks use new synthetic accounts and return only status records.

Final browser suite: 11 desktop/mobile cases passed (3 input-specific combinations skipped). This includes touch hold, keyboard positioning, native-pointer before/after placement and failed-save rollback. Initial restored order does not animate, and auto-scroll activates only near viewport edges.

Online browser smoke passed insertion before and after specific cards, followed by persistence checks on PostgreSQL. Both stable aliases now point to this Ready Preview.
