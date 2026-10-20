# Basic learning companion Preview acceptance — 2026-10-19

## Release

Stable URL: <https://haui-compass.vercel.app/>.
Immutable Preview: <https://haui-compass-8gsxccncu-nam-4b71.vercel.app/>.
Deployment ID: `dpl_2qmymAc8S1zuBvc2tMdkPVswNDD8`, READY, Preview.
The older stable Preview alias also points to this release.

Deployed the current working tree on `feat/vercel-staging-deployment` via the
Vercel CLI. This was not a commit/push or Production deployment. The source digest
in the evidence file covers app source, corpus and build manifests; it is not a Git
commit SHA. No schema migration or database reset was performed.

One additional synthetic lecturer account was registered and granted only
`canvas-demo-ai` and `canvas-demo-small` in the branch-specific Preview grant
configuration. Existing grants were preserved. The registered accounts, passwords,
IDs, session data and environment values are omitted from evidence.

## Online acceptance

| Check | Result |
| --- | --- |
| Registration opens Plan–Do–Reflect home without upload | PASS, browser |
| Decomposition candidates and explicit task confirmation | PASS, browser and HTTP |
| Weekly proposal and approval | PASS, browser and HTTP |
| Complete task and log 80 minutes | PASS, browser and HTTP |
| Reload preserves progress | PASS, browser |
| Missed-session reminder and approved adaptation, revision 2 | PASS, browser and HTTP |
| End-of-week reflection and selected signals | PASS, browser and HTTP |
| Next-week suggestions carry unfinished work, workload and difficult topic | PASS, browser and HTTP |
| Next-week approval and re-login persistence | PASS, browser and HTTP |
| Independent student clocks/tasks and cross-account denial | PASS, HTTP |
| Lecturer normal login reaches `/lecturer` | PASS, browser |
| Before/after 25% (3/12) → 50% (6/12), +25 percentage points | PASS, browser and HTTP |
| Small cohort hides counts and comparison | PASS, browser and HTTP |
| Lecturer formula disclosure | PASS, browser |
| Lecturer desktop/mobile layout without horizontal overflow | PASS, browser; temporary viewport reset |
| Student lecturer access and foreign workspace access | 403, HTTP |
| Lecturer student workspace access | 403, HTTP |
| Lecturer unassigned class access | 404, HTTP |
| Google sign-in on stable alias | PASS after owner completed provider identity verification |

The full synthetic weekly HTTP cycle and nine role/isolation probes were repeated
against the final immutable deployment. Browser student work began on the initial
same-source release and its saved plan remained visible after the stable alias moved
to the final deployment. The final release added the synthetic lecturer grant and
updated acceptance harness contracts; no application logic changed between releases.

The initial custom persistence check compared the full context returned before a
next-week plan approval with the context after approval. Saved free-time windows
legitimately differ after approval. The check was corrected to compare durable
student identity, clock, period and tasks, and separately verify the saved draft.
The fresh complete cycle then passed. No application fix was needed.

Chrome disconnected twice during browser acceptance. Fresh connections resumed
the same tabs and stored state. Google required recovery-account verification;
the owner completed it directly, then the browser visibly reached `/learn`.
No OTP, phone number, signed document source or browser cookie was collected.

## Evidence and limits

[Sanitized machine-readable evidence](evidence/basic-companion-preview-20261019.json)
contains only deployment/source metadata, fixed check outcomes and allowlisted HTTP
status records. No private reader was opened and no browser trace/HAR was recorded.
An unsigned request to the immutable deployment returned 302, which is a protection
redirect rather than evidence of application authorization.

Dashboard periods are hand-authored mock data, not an impact study and not live
aggregation of student activity. Deadline reminders are in-app. Decomposition during
browser acceptance used the visibly labelled offline template fallback, so this run
does not certify live model quality. Google OAuth remains External / Testing.

This acceptance covers the basic Preview flow, not Production readiness, Canvas
integration, private Blob bearer behavior or a 1,000-user capacity claim.
