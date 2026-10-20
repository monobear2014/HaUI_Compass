# Ticket dialogs and account menu — 2026-10-20

Deployment: https://haui-compass-9hfqdyhy4-nam-4b71.vercel.app (READY). Stable aliases updated.

Clicking a ticket dialog backdrop closes create/edit. Account popover uses fixed viewport placement, so sidebar scrolling/collapse does not clip it. Account, demo scenario and logout controls share consistent sizing and borders.

Validation: TypeScript/ESLint and production build passed. Synthetic account browser checks confirmed outside-click dismissal, desktop bounds with expanded/collapsed sidebar, outside click on account popover, and mobile viewport bounds. Desktop and mobile screenshots were visually reviewed.
