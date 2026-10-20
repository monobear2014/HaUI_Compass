# Saved chatbot conversations — 2026-10-20

Ready Preview: https://haui-compass-71mpvd03e-nam-4b71.vercel.app
Stable aliases: https://haui-compass.vercel.app and https://haui-compass-preview-nam-4b71.vercel.app

API migration 0009 introduces owned conversation metadata and a conversation reference on exchanges. Existing transcripts are preserved in legacy conversations. Nullable references allow old workers to continue writing during deployment; new workers adopt those writes when history is read. The temporary migration build command was removed from the final deployment and vercel.json restored.

Validation: backend suite excluding PostgreSQL passed; targeted PostgreSQL persistence, legacy migration/rolling-worker compatibility and schema-head checks passed (3). The combined desktop/mobile companion, legacy-route and public-courseware suite passed 20 cases. TypeScript, ESLint and production builds passed. Synthetic-account online browser acceptance passed new conversations, separate transcripts, selection/reload restoration, fresh-login persistence and owner isolation. The history layout was visually inspected.

No real account password or private document reader was used. Evidence contains status records only. Confirmed memories remain independent of conversation history; no plan or assignment is modified by creating or switching chats.
