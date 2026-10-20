# Student courseware navigation

Implemented 2026-10-19 after the public-source corpus release.

- `/knowledge?course=ml` (or ai/la/stats/automation/db/se) selects the requested course.
  Unknown or absent course IDs open AI, which has actual public resources.
  Suspense wraps the client search-parameter reader for static Next.js production builds.
- The existing Today task material link uses an explicit reviewed course-name mapping.
  Unknown names open the general library. No inferred mapping or additional task buttons.
- The learning-home CTA now says Explore courseware, matching its actual contents.
- Catalog filtering matches title, author and publisher. Filtering does not silently change
  the active reader; the selected resource remains available while the match count describes
  matching documents. The original source and license links remain unchanged.

Validation: TypeScript, scoped ESLint, production build; ten existing desktop/mobile Q&A
and reader cases; four reader/filter/deep-link cases; course-name mapping/unknown fallback test.
No backend, storage, document contents, authentication, roles or schema changes in this increment.


Preview deployment: https://haui-compass-nfk5vsxkn-nam-4b71.vercel.app
Deployment ID: `dpl_9F3qaDvR4jo4AnR5pbvsJbfY38JB`.
Direct Chrome acceptance was unavailable because the browser control connection timed out;
this increment's UI was verified by local desktop/mobile Playwright and a production build.
Online authenticated API smoke verifies the bundled originals, five Vietnamese grounded answers,
abstention, page guards and role/anonymous isolation.

Stable and compatibility aliases updated after online smoke passed. Source catalog:
https://haui-compass.vercel.app/knowledge?course=ai
