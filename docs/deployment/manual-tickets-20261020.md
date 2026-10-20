# Manual tickets and multi-ticket columns — 2026-10-20

Deployment: https://haui-compass-po729kg7w-nam-4b71.vercel.app (READY).

Both stable aliases point to this deployment. No schema migration required.

Adds Create ticket to Weekly plan and Today, with persisted assignment-linked study tasks and notes. Removes board entry limits and the focus-switch block that stopped starting another ticket. All four columns support many tickets; drop areas stretch for easier placement. Details wait for board metadata before opening to preserve saved notes after navigation.

Validation: 14 browser checks passed; five ticket API tests; PostgreSQL persistence across fresh instances; full non-PostgreSQL backend suite; TypeScript, ESLint, Ruff and production build. Synthetic-account online checks passed for three UI-created tickets, multiple tickets in all four columns across reloads, and saved notes. No real account data or private documents used.

Evidence: `evidence/manual-tickets-20261020.json`.
