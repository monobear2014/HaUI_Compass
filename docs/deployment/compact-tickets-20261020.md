# Compact tickets — 2026-10-20

Preview: https://haui-compass-82wiy9ffu-nam-4b71.vercel.app

Cards are compact in Weekly plan and Today: two-line title, ellipsized course, key/deadline and optional today/focus indicator. All action controls, estimates, logged time and assignment information are in the editable detail dialog. Drag/drop remains available. No backend schema or data changes.

Validation: TypeScript, ESLint, production build and diff whitespace checks passed. The revised ticket UI suite passed 6 desktop/mobile cases, including editing/cancel/persistence, daily selection, actual time logging, reversible columns and native desktop drag. After the final layout adjustment, compact-card checks passed again on both viewports; screenshots were visually inspected.

Online synthetic-account UI smoke passed compact card size, absence of inline controls, and opening editable details. Both stable aliases updated to this Ready Preview.
