# Avatar and reversible board release — 2026-10-20

Ready Preview: https://haui-compass-9ncxr1da1-nam-4b71.vercel.app
Stable aliases: https://haui-compass.vercel.app and https://haui-compass-preview-nam-4b71.vercel.app

Web PostgreSQL migration 006 adds account-owned normalized avatars. No API schema migration is required for the extra validated columns map in the existing JSON board payload.

Validation: TypeScript and ESLint passed. Ticket API integration tests passed (3). Desktop/mobile account and ticket checks cover raster uploads, persistence/reset, invalid data, size/origin validation, forward/backward column selection and actual execution logging. Desktop native drag was verified to In review and back to To do using the column heading as drop target. Online synthetic-account smoke passed all five image formats and six forward/backward column transitions, with evidence limited to allowlisted status records in the accompanying JSON.

No real account password or private document was used. Ticket board movement does not create or erase execution facts and does not submit LMS assignments. Existing daily/generation board scope remains unchanged.

Ticket editing: title and description save/cancel, persistence across reload/day, and stale-write rejection passed. Account/ticket suite passed 18 desktop/mobile cases; after adding editing, the ticket suite passed 12 cases. TypeScript and ESLint passed again. Online PostgreSQL smoke also passed editing and next-day persistence.
