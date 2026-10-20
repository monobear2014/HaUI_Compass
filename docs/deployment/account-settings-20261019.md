# Account settings and navigation — 19 October 2026

Delivered direct language/theme controls, a bottom-left account disclosure with
settings/sign-out, profile editing and password rotation. Removed the duplicate
knowledge page/navigation and home promotion; retained public original materials
inside the one companion rail. Old course links redirect to that rail.

Web PostgreSQL migration revision 5 was applied using the web service's migration
runner before the normal release build. Existing users, document ownership,
Google identities and learning data keep their original identifiers.

Validation:
- Combined account / ticket / companion checks: 20 desktop/mobile cases passed.
- Final account, route and original-courseware checks: 14 cases passed, including
  collapsed navigation, logout, preserving unsaved profile text across VI/EN,
  original Markdown/PDF reading and source citations.
- Account and Google-identity checks: 8 cases passed.
- Production Next.js / PostgreSQL account and Plan–Do–Reflect checks: 4 passed.
- Configuration/privacy regression checks: 33 passed.
- Production builds, TypeScript and ESLint passed.
- Online API acceptance uses newly created synthetic accounts only. Profile
  persistence, account isolation, date validation, password verification/session
  rotation and legacy route resolution are recorded in allowlisted evidence.

Native computer-use verification was unavailable because the browser request
policy could not load. Automated UI screenshots were inspected for desktop and
mobile; online behavior was checked through the authenticated API. No actual
user profile or password was changed during acceptance.
