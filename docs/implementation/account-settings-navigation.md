# Account settings and single-assistant navigation

The student top bar exposes Vietnamese/English and light/dark controls directly.
The bottom-left account disclosure contains Account settings, optional simulation
tools and Sign out; it remains usable when navigation is collapsed. Outside click
and Escape close the disclosure.

The duplicate document Q&A navigation and learning-home promotion were removed.
`/knowledge?course=...` now redirects to `/learn?assistant=1&course=...`; the one
right-side assistant selects that course. Ticket material links open that same
assistant. Public original courseware remains readable in the Materials tab with
publisher/license/source links and PDF pagination. The private document assistant
and citation behavior remain in the existing dock.

Authenticated `GET/PATCH /api/account` owns profile edits: display name, optional
birth date, field of study and biography. Unknown fields and invalid/future dates
are rejected. Birth date/profile fields are separate from AI context and lecturer
aggregates. Google display-name edits survive subsequent provider sign-in.

`POST /api/account/password` verifies the current password using the existing login
limiter, stores a new salted scrypt hash, uses compare-and-swap against concurrent
changes, and atomically revokes existing sessions while creating a replacement
session for the caller. Google-only identities reject this endpoint and use Google
security settings. Only synthetic accounts were used to test password changes.

Web migration `005_account_profiles.sql` adds a separate profile table without
changing existing identity columns. SQLite development uses the same profile
shape. The web PostgreSQL migration runner applies revision 5 transactionally.

Validation includes desktop/mobile profile edits, unsaved drafts across language
changes, collapsed account-menu navigation, logout, session rotation, legacy-route
redirects and public Markdown/PDF source reading. Production PostgreSQL acceptance
also exercises the existing Plan–Do–Reflect cycle.
