# HaUI LMS Discovery

**Status:** RESEARCH / DISCOVERY ONLY
**Branch:** `docs/haui-lms-discovery`
**Access date for web evidence:** 2026-09-29
**Scope:** public, non-invasive discovery. No credentials were used, no authenticated
session was inspected, and no production integration code was added.

## Executive summary

HaUI does not present as one single LMS. Public HaUI-controlled material identifies at
least two relevant boundaries:

1. **Cổng thông tin sinh viên / Đại học điện tử** at `sv.haui.edu.vn` (an older official
   guide also names `sv.dhcnhn.vn`) for student identity, course registration, timetable,
   online-learning entry points, and academic results.
2. **Đào tạo trực tuyến / LMS** at `lms.haui.edu.vn`, visibly a Moodle deployment, for
   course areas, learning content, assignments, quizzes, and student submissions.

HaUI also exposes One HaUI and MyHaUI as access/application surfaces, and official ITC
material refers to TMS, LMS, online training, and other training systems. EOP appears in
official HaUI-hosted material as a specialized English-for-Occupational-Purposes learning
system, but its current system boundary and data interface are not established here.

The public evidence is sufficient to establish the likely ownership split, but not to
authorize or implement an adapter. No public HaUI API/OpenAPI/GraphQL/LTI integration
contract for the required student-scoped data was found. The current pilot therefore
should not claim real LMS integration.

**Overall recommendation: NEEDS INSTITUTIONAL ACCESS.** Request an approved integration
path from HaUI ITC/academic administration. In parallel, a transparent manual-import
pilot is feasible if its provenance is shown to the student.

## Systems discovered

| System | Official URL/domain | Apparent purpose and audience | Authentication evidence | Confidence |
|---|---|---|---|---|
| Cổng thông tin sinh viên / Đại học điện tử | [sv.haui.edu.vn](https://sv.haui.edu.vn/) | Student-facing academic portal. An official HaUI unit page lists student information, course registration, timetable, online learning, exam schedule, learning results, and related services. | The public landing page is a login page. Official HaUI guidance says students use an issued account; an older official guide says the username is the student ID and the initial password is supplied by the university. | CONFIRMED for existence and student-facing scope; mechanism details UNKNOWN |
| Legacy/alternate student portal hostname | [sv.dhcnhn.vn](https://sv.dhcnhn.vn/) | The official student online-learning guide instructs students to start at this hostname and select “Học trực tuyến”. It may be an older or alternate hostname, not necessarily a separate system. | Login is required according to the guide. | CONFIRMED as a referenced hostname; relationship to `sv.haui.edu.vn` UNKNOWN |
| Online training / LMS | [lms.haui.edu.vn](https://lms.haui.edu.vn/) | Course learning areas, learning materials, assignments, quizzes, comments, and file submissions. The public HTML exposes Moodle markers and Moodle course/login routes. | Public page exposes login and password-reset links. An official ITC guide for lecturers gives the LMS URL and says its account/password matched the older e-learning account at that time. | CONFIRMED as HaUI LMS; Moodle deployment CONFIRMED from public page markers |
| One HaUI | [one.haui.edu.vn](https://one.haui.edu.vn/) | HaUI portal/app surface for staff and learners, linking to student portal, blended learning, online learning, and study registration. | Public page separates “CBGV HaUI” and “Người học”; actual SSO/token protocol UNKNOWN. | CONFIRMED as an access surface; ownership of each linked data set UNKNOWN |
| MyHaUI | Referenced by official HaUI admission guidance; app/distribution URL is [dhcnhn.vn/myhaui](https://dhcnhn.vn/myhaui) | Mobile/application surface for student onboarding and university services. | Official guidance says students can use MyHaUI or the student portal with issued credentials. | CONFIRMED as a student application surface; data/API boundary UNKNOWN |
| TMS (Teaching Management System) | [tms.haui.edu.vn](https://tms.haui.edu.vn/) is named in the official ITC manual | Lecturer/teaching operations: classes, attendance, online-learning statistics, grade aggregation, and reports. It is not established as a student-facing source for Compass. | Official manual says TMS accounts were synchronized from QUIZ at the time of the manual. | CONFIRMED as historical official system; current API and student access UNKNOWN |
| EOP / specialized learning platform | Official HaUI-hosted [EOP reference](https://cps.haui.edu.vn/media/29/uffile-upload-no-title29740.pdf) | Official HaUI-hosted material identifies an “EOP system at HaUI”; EOP is a specialized learning context, but the current URL, owner, course population, and records exposed are not established. | UNKNOWN; do not assume it shares LMS credentials. | CONFIRMED as a referenced concept; current boundary UNKNOWN |
| HaUI ITC Help Desk | [help.haui.edu.vn](https://help.haui.edu.vn/) | Official support/catalogue surface for university digital services. It lists online training/LMS, Đại học điện tử, One HaUI, and MyHaUI guidance. | Support links are public; individual system authentication remains system-specific. | CONFIRMED |

The [HaUI student-management page](https://cqa.haui.edu.vn/thong-bao/quan-ly-sinh-vien/)
explicitly groups course registration, timetable, online learning, exam schedule, and
learning results under the student portal. The [One HaUI landing page](https://one.haui.edu.vn/)
also links “CTT sinh viên”, “Học kết hợp”, “Học trực tuyến”, and “Đăng ký học tập”. These
are evidence of multiple services, not proof that they share one backend or one API.

## Authoritative sources

The strongest sources found were first-party HaUI domains and official HaUI-hosted PDFs:

| Source | Relevant finding |
|---|---|
| [HaUI student management](https://cqa.haui.edu.vn/thong-bao/quan-ly-sinh-vien/) | Lists the student-portal capabilities: student information, course registration, timetable, online learning, exam schedule, and learning results. |
| [HaUI online-learning guide for students](https://fee.haui.edu.vn/media/30/uffile-upload-no-title30094.pdf) | Describes entering online learning from the student portal, selecting a course section, viewing content, assignment requirements, submitting a file, and communicating with the teacher. |
| [HaUI ITC training-system manual](https://itc.haui.edu.vn/media/Tai%20Lieu%20Huong%20Dan/So-tay-van-hanh-he-thong-dao-tao-GV.pdf) | Names LMS and TMS, documents LMS assignment/upload and extension behavior, and describes transfer of LMS grades into TMS. This is a 2020–2021 manual and is historical evidence, not a current contract. |
| [HaUI Help Desk](https://help.haui.edu.vn/) | Identifies ITC as the support/operator context and catalogs Đại học điện tử, LMS, One HaUI, and MyHaUI guidance. |
| [HaUI Microsoft 365 announcement](https://sict.haui.edu.vn/vn/thong-bao/haui-trien-khai-microsoft-office-365-cho-vien-chuc-nguoi-lao-dong-va-nguoi-hoc/71625) | Confirms institutional Microsoft 365 identities tied to `@haui.edu.vn`; it does not establish that the student portal or LMS uses Microsoft OAuth/OIDC. |
| [Public LMS page](https://lms.haui.edu.vn/) | Public HTML exposes Moodle-specific markers/routes and a Moodle privacy page link. This confirms the visible LMS implementation family, not the enabled API services or authorization to call them. |
| [HaUI One portal](https://one.haui.edu.vn/) | Shows separate learner/staff entry points and links to several learning/registration services. |

### Current HaUI Compass baseline

The repository inspection confirms that the discovery target is intentionally narrow:

- `application/ports/lms.py` defines a read-only, student-scoped `LMSProvider` with
  `get_courses`, `get_assignments`, and `get_submission_statuses`.
- `LMSCourseRecord`, `LMSAssignmentRecord`, `LMSSubmissionRecord`, `ExternalRef`, UTC
  normalization, and the four normalized submission states are already implemented.
- `application/lms_mapping.py` maps courses and dated assignments to domain objects,
  reports undated assignments as `NO_DEADLINE`, and does not invent effort or submission
  data.
- `MockLMSProvider` is deterministic fixture infrastructure. The provider-agnostic contract
  tests in `tests/support/lms_contract.py` define the minimum behavior for any future
  adapter.
- The composition root currently defaults to `MockLMSProvider`. Daily recommendation,
  persisted weekly-plan generation, and persisted replanning receive an injected
  `LMSProvider`; the current domain does not consume submission status in planning.
- ADR-0002 keeps courses, assignments, deadlines, and submission status authoritative in the
  LMS and deliberately does not add `CourseRepository` or `AssignmentRepository` in v0.

This means a real HaUI adapter can be evaluated against an existing boundary without
changing the domain during this discovery phase. It does not mean that the current API has
production identity, real HaUI data, or a synchronization/cache layer.

## Academic data ownership

The table distinguishes what the public evidence establishes from what still requires
authenticated inspection or institutional confirmation.

| Required data | Likely source of truth | Publicly visible? | API evidence | Current conclusion |
|---|---|---|---|---|
| Courses / enrolled course sections | Student portal for registration/enrollment; LMS for the learner's online course areas. A course “catalog” and a student's enrollment are different facts. | Portal capabilities are publicly described; a student's actual courses require login. LMS home/course index is public but learner-specific courses require login. | No HaUI-published API contract found. Moodle has standard API concepts, but enabled services and tokens are unknown. | **PARTIAL / NEEDS INSTITUTIONAL ACCESS** |
| Assignments | LMS, including specialized LMS/EOP systems where a course is delivered there. | Assignment requirements and file submission are described in an official student guide; individual assignment data is authenticated. | No documented HaUI endpoint found. | **PARTIAL / NEEDS INSTITUTIONAL ACCESS** |
| Deadlines | LMS activity configuration is the likely source for online assignments. Portal/academic systems may own formal exam or registration dates, which are not interchangeable with assignment deadlines. | Not student-specific without login. Official materials establish that LMS activities can have configured timing and extensions. | No documented HaUI endpoint found. | **UNKNOWN / NEEDS INSTITUTIONAL ACCESS** |
| Submission status | LMS activity/submission records; possibly TMS for lecturer-side grade/teaching workflows. | The guide documents submitting a file; it does not expose a public student submission-status feed. | No documented HaUI endpoint found. | **UNKNOWN / NEEDS INSTITUTIONAL ACCESS** |
| Timetable | Student portal / Đại học điện tử. | Capability is publicly named; a student's timetable requires login. | No documented HaUI endpoint found. | **PARTIAL / NEEDS INSTITUTIONAL ACCESS** |

Do not treat a public course index, a timetable page, or an HTML form as an API. Do not
assume that the Moodle LMS owns registration, formal results, or every deadline.

## Authentication findings

### Confirmed

- The student portal is authenticated; its public page is a login page.
- Official HaUI guidance says students use university-issued credentials and identifies
  the student ID as the username in an older online-learning guide.
- HaUI provides Microsoft 365 accounts associated with `@haui.edu.vn` identities.
- The LMS exposes its own login/password-reset surface. An older official ITC manual says
  LMS credentials matched the old e-learning account at that time.

### Unknown

- Whether `sv.haui.edu.vn`, One HaUI, MyHaUI, and `lms.haui.edu.vn` use one SSO session.
- Whether the identity platform uses OAuth 2.0/OIDC, SAML, a local session, or a mixture.
- Whether the LMS is federated to Microsoft identity or has separate/local credentials.
- Whether student consent, delegated access, service accounts, or institution-issued OAuth
  clients are available for third-party applications.
- Token audience, scopes, refresh behavior, session lifetime, MFA, rate limits, and audit
  requirements.

All of these are **NEEDS AUTHENTICATED INSPECTION** or institutional confirmation. No
credential, cookie, token, CAPTCHA, or private student data was requested or stored.

## API / integration findings

### Public evidence

The public LMS page is visibly a Moodle deployment: its HTML contains Moodle branding,
Moodle JavaScript/theme routes, `/my/courses.php`, `/course/index.php`, and a Moodle mobile
link. The official ITC manual documents user workflows for LMS courses, assignments,
uploads, extensions, and grade transfer to TMS.

### Not found

No public HaUI-owned OpenAPI/Swagger, GraphQL schema, REST integration guide, LTI contract,
Moodle Web Services enablement statement, Canvas API documentation, or institution-issued
third-party client registration instructions was found in the reviewed first-party sources.
The public Moodle surface alone does not establish that Web Services are enabled or that a
student-scoped token can read the required resources.

### Interface inventory

| Interface | Auth requirement | Relevant resources | Confidence |
|---|---|---|---|
| Public LMS HTML/Moodle UI | Public navigation plus login for learner data | Course index and login are visible; learner courses, activities, due dates, and submissions are likely authenticated | CONFIRMED as UI; not an integration contract |
| Moodle Web Services | Unknown; normally requires institution-enabled service/token policy | Courses, enrolled courses, activities, submissions may be representable if enabled | UNKNOWN; do not call without HaUI approval |
| Student-portal web UI | Login required | Enrollment, timetable, formal learning information | CONFIRMED as UI; API UNKNOWN |
| One HaUI/MyHaUI app or bridge | Login/identity likely required | May link or broker several services | UNKNOWN; no public integration contract |
| TMS/LMS grade transfer | Internal system workflow described in official manual | Lecturer-side grades and teaching reports | CONFIRMED historically as workflow; not a student API |

No endpoint was brute-forced or scanned. Normal public pages were inspected only to identify
published links, technology markers, and documentation.

## Safe future frontend-network inspection plan

This is a procedure for a student/developer using their own authorized account after HaUI
approval. It was **not executed** in this discovery.

1. Obtain written permission from HaUI ITC or the system owner and define the allowed host,
   account, data fields, request frequency, retention, and redaction rules.
2. Sign in normally through the official UI. Do not automate login, bypass MFA/CAPTCHA, or
   share credentials with Compass.
3. Open browser DevTools → Network and enable “Preserve log”. Filter to `Fetch/XHR` and
   inspect only actions the user is authorized to perform.
4. In the student portal, record the request/response shape for viewing one’s own enrolled
   course, timetable, and (if present) academic result. Redact cookies, authorization
   headers, student identifiers, names, files, and tokens before saving evidence.
5. In the LMS, open one authorized course and inspect the normal requests made when viewing
   activities, opening an assignment, viewing its due date, and viewing the user’s own
   submission state. Record method, relative route, status, content type, pagination,
   identifiers, timezone, and error behavior—not secrets or full payloads.
6. Repeat only where the UI exposes it: an extension, resubmission, late status, or missing
   deadline. Do not create, edit, submit, or delete coursework for discovery.
7. Compare observed fields against the compatibility matrix below. A browser request is
   evidence of an implementation detail, not permission to depend on it; request an
   official API or written stability commitment before production use.
8. Destroy temporary HAR files or redact them under the approved retention policy. Never
   commit cookies, bearer tokens, session IDs, student data, or assignment files.

## LMSProvider compatibility matrix

The current normalized boundary is defined in `apps/api/src/haui_compass/application/ports/lms.py`.
The table reports the status of the required fields based on public evidence, not on an
authenticated sample.

| Normalized record / field | Public evidence status | Mapping note |
|---|---|---|
| `LMSCourseRecord.ref` / external id | UNKNOWN | Likely available in either portal or LMS responses, but identifier stability and scope are unconfirmed. |
| `LMSCourseRecord.name` | PARTIAL | Course sections and learning areas are evidenced; exact learner-scoped field shape is unauthenticated. |
| `LMSCourseRecord.code` | UNKNOWN | The current port permits it, but no public learner payload was inspected. |
| `LMSAssignmentRecord.ref` / external id | UNKNOWN | LMS must provide a stable activity/assignment identity; not established publicly. |
| `course_ref` | PARTIAL | Official guide shows assignments inside course sections; exact cross-system identity mapping is unknown. |
| `title` | PARTIAL | Assignment requirements are confirmed in the student guide; exact normalized title field is not. |
| `deadline` | PARTIAL | LMS timing/extension behavior is documented, but actual deadline field, timezone, and null behavior need authenticated confirmation. |
| `estimated_effort` | NOT AVAILABLE / NOT EXPECTED | The project contract explicitly says a real LMS adapter should normally return `None`. HaUI is not required to provide this. |
| `LMSSubmissionRecord.assignment_ref` | UNKNOWN | Submission is documented, but stable assignment identity in the response is unknown. |
| `status` | UNKNOWN | The UI supports submission; the normalized distinctions `not_submitted`, `submitted`, `late`, and `unknown` need a source-specific mapping. |
| `submitted_at` | UNKNOWN | No public student submission-status payload was found. |

The current mapper intentionally skips assignments without deadlines rather than inventing
one, and the domain has no submission entity. This is a contract gap only if the pilot needs
submission-aware planning: the LMS port can carry submission status, but current domain/API
workflows do not use it in v0.

## Source-of-truth mapping

| Fact | Recommended source-of-truth interpretation | Rationale / limitation |
|---|---|---|
| Student enrollment/course sections | Student portal for registration; LMS for online-course membership | Registration and learning delivery are different boundaries. |
| Online course content and activities | LMS or the specialized platform hosting that course | Official student guide places content and assignments inside online course sections. |
| Online assignment deadlines | The activity-owning LMS | Do not substitute a timetable or formal exam date. Extensions may be stored at activity/student level. |
| Submission status | The activity-owning LMS; TMS may consume lecturer-side results | TMS grade transfer is documented, but it is not evidence that TMS is the canonical submission store. |
| Timetable | Student portal / Đại học điện tử | Official HaUI materials list timetable under the student portal. |
| Formal grades/results | Student portal and/or TMS-backed academic system | The public evidence shows both student results and TMS grade workflows; exact authority requires HaUI confirmation. |

This points to multiple future adapters rather than one assumed `HaUILMSProvider`:

- `HaUITrainingPortalProvider` for student enrollment and timetable data;
- `HaUIOnlineLearningProvider` for `lms.haui.edu.vn` Moodle data; and
- a separately named specialized provider if EOP or another platform is confirmed to own
  independent courses/activities.

They may be composed behind application use cases, but should not silently merge records
with identical-looking course names. `ExternalRef(provider, id)` is appropriate for keeping
source namespaces distinct.

## Privacy / authorization constraints

The reviewed public material did not reveal a clear HaUI policy granting third-party
automated access to student portal or LMS data. The Help Desk identifies ITC as the support
and systems context, while the public LMS page exposes a privacy-page link; neither is an
integration authorization. Absence of a public prohibition is not permission.

Before any real adapter, obtain institutional approval covering purpose, lawful basis/consent,
minimum fields, retention/deletion, logging, incident handling, student withdrawal, and
whether data may leave HaUI infrastructure. A pilot should minimize data and isolate one
student's records from all others.

Without explicit authorization, HaUI Compass must not:

- store raw student passwords;
- bypass SSO, MFA, CAPTCHA, access controls, or rate limits;
- scrape other students' data or impersonate staff;
- reverse engineer private interfaces beyond an approved inspection;
- commit cookies, bearer tokens, session identifiers, HAR files, or private payloads; or
- submit, edit, grade, or otherwise mutate coursework.

## Integration options

| Strategy | Coverage | Authorization | Stability / complexity | Pilot / production suitability |
|---|---|---|---|---|
| A. Official documented API | Potentially full per approved resources | HaUI-issued client/token or service integration | Best stability; requires API contract, scopes, quotas, and support | Preferred for pilot and production if offered |
| B. Institution-approved internal API | Potentially full, possibly broader than public API | Formal institutional agreement and network/security controls | Good if versioned; high coordination and security responsibility | Suitable when HaUI ITC owns the interface |
| C. LTI or another standard integration | Course/activity context may be good; submission semantics depend on platform | Institution/platform registration and launch policy | Standards-based but coverage is not guaranteed | Worth evaluating for LMS launch/context, not assumed sufficient for all four capabilities |
| D. Authorized browser/session-backed integration | Could cover what the user can see | Explicit approval; user session and consent handling | Fragile, privacy-sensitive, and hard to operate safely | Discovery only or temporary controlled pilot; not a production default |
| E. Manual import/export | Courses/assignments/deadlines can be covered if the export includes them; submission status depends on export | Student/faculty/institution-approved export | Low technical complexity; provenance and freshness must be visible | Honest fallback pilot; production only with an agreed operational process |
| F. No viable technical access | No real-time coverage | No institutional path | No implementation risk, but no real integration | Correct conclusion if approval/API is unavailable |

No numeric ranking is used. The choice depends on HaUI's approved interface, required
coverage, and data-protection conditions.

## Pilot fallback options

If institutional API access is unavailable, the smallest honest pilot is **manual academic
data import**:

1. Let a student import a CSV or structured form containing course name/code, assignment
   title, deadline, and optional source URL.
2. Keep `estimated_effort` as unknown unless the student explicitly supplies an estimate;
   never pretend it came from HaUI.
3. Represent submission status as student-confirmed/manual or unknown unless an official
   export contains it.
4. Display provenance and “last updated” time on every imported item.
5. Offer manual correction/deletion and do not request the student password.

An institution-approved CSV/ICS export or faculty-provided fixture is preferable to ad-hoc
scraping. If no approved export exists, manual course/deadline entry is still a valid
planning pilot, but it must be labeled as user-entered data rather than LMS integration.

## Recommended architecture

The existing `LMSProvider` contract is sufficient as a first read-only normalization boundary
for courses, assignments, deadlines, and submission status. It already provides:

- student-scoped reads;
- namespaced `ExternalRef` identities;
- immutable normalized records;
- UTC normalization for deadlines/submission times;
- explicit `UNKNOWN` submission status; and
- no raw provider payload leakage.

No contract change is recommended during discovery. Future providers would implement:

```text
HaUITrainingPortalProvider : LMSProvider
  get_courses(student)
  get_assignments(student, courses=...)
  get_submission_statuses(student, assignments=...)

HaUIOnlineLearningProvider : LMSProvider
  get_courses(student)
  get_assignments(student, courses=...)
  get_submission_statuses(student, assignments=...)
```

The method names can remain identical even when the underlying systems differ. A provider
must not fabricate records for data it cannot access. If one student course spans both portal
and LMS references, composition needs an explicit cross-system enrollment/linking policy;
course-name matching is not sufficient.

### Contract gaps to track, not fix here

- No `fetched_at` or freshness/provenance field exists on normalized records, despite the
  architecture discussion describing synchronization provenance as a future concern.
- No enrollment record or timetable record exists in the current port.
- No submission domain entity exists, so submission data is currently boundary-only and not
  consumed by planning workflows.
- `LMSNotFoundError` does not distinguish authentication failure, authorization failure,
  provider outage, and not-found; an adapter will need an application-safe error mapping
  without leaking provider details.
- `estimated_effort` is intentionally not an LMS requirement and should remain optional.

These are follow-up design questions, not reasons to expand the current discovery branch into
implementation.

## Auth architecture implications

The result is **UNKNOWN / NEEDS INSTITUTIONAL ACCESS**.

User authentication should not be assumed reusable from the current demo identity: the API
currently receives a trusted development request field and composes `MockLMSProvider` by
default. A real integration may instead use institution-approved service credentials, an
OAuth/OIDC delegated flow, an LMS token, or an approved export. Until HaUI confirms the
model, the safe architecture is:

- keep authentication separate from `LMSProvider`;
- do not put passwords/tokens into the port or normalized records;
- do not reuse demo identity as HaUI identity; and
- decide whether production user auth must precede the adapter after HaUI confirms the
  authorized integration mode.

## Capability decision matrix

| Capability | Decision | Evidence and rationale |
|---|---|---|
| Courses | **PARTIAL — NEEDS INSTITUTIONAL ACCESS** | Student portal and LMS course surfaces are confirmed, but learner enrollment and stable external IDs/API access are not public. |
| Assignments | **PARTIAL — NEEDS INSTITUTIONAL ACCESS** | Official student guide confirms assignment requirements and file submission in online learning; no public machine interface or authenticated sample confirms fields. |
| Deadlines | **UNKNOWN — NEEDS INSTITUTIONAL ACCESS** | Official LMS manual confirms configurable activity timing and extensions, but current per-student deadline semantics, timezone, and endpoint are unknown. |
| Submission status | **UNKNOWN — NEEDS INSTITUTIONAL ACCESS** | Submission is documented as a UI workflow; no public status payload/API or mapping to submitted/late/not-submitted was found. |

There is no basis for a GO decision on a real HaUI adapter. There is also no basis for a
NO-GO on the technical concept: the systems visibly support the needed user workflows, and
Moodle is a plausible implementation source, but access and authorization remain unproven.

## Open questions

1. Which current system is authoritative for student course enrollment: `sv.haui.edu.vn`,
   One HaUI/MyHaUI, or another academic backend?
2. Is `sv.dhcnhn.vn` retired, an alias, or a separate deployment?
3. Which systems currently deliver EOP and other specialized courses?
4. Is `lms.haui.edu.vn` the current LMS for all students, or only specific course groups?
5. Are Moodle Web Services enabled? If yes, which functions, scopes, token type, rate
   limits, and version-support policy apply?
6. Is there an official API/export for enrollment, timetable, assignments, due dates, and
   the student's own submission status?
7. Which identity protocol is approved for third-party applications, and is delegated
   student consent supported?
8. Does HaUI permit a hosted third-party service to process student academic data, or must
   the pilot run inside HaUI-controlled infrastructure?
9. Which timezone and deadline semantics apply to LMS activities and extensions?
10. What retention, deletion, audit, incident, and student-withdrawal requirements apply?

## Recommended next action

Request an institutional discovery meeting with HaUI ITC and the academic-system owner.
Provide the four required capabilities and the exact normalized fields from the
`LMSProvider` contract. Ask for one of the following, in order of preference:

1. a documented, institution-approved API/client for the student-scoped data;
2. an approved authenticated test environment or sandbox for a student-session inspection;
3. an official CSV/ICS/export process for a transparent pilot.

Until one of these is granted, continue only with the manual-import fallback and label it
as such. Do not implement `HaUILMSProvider`, scrape the Moodle UI, or build auth logic on
assumptions.
