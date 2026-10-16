# Free classroom activity report

An eligible free classroom teacher opens **Share this report** from My Classes.
`GET /app/classroom-report` is an authenticated, read-only report. Copy summary
and browser print share the displayed aggregates and definitions without student
identities, writing, grades or an authenticated link. This is recorded activity,
not a measure of learning gains, time saved or trial performance.

## Scope and counts

The scope is **all years**, across non-archived classes taught by the authenticated
active teacher membership in the currently selected organization. My Classes
year and location filters do not narrow the report; the report states its own
scope. Query parameters cannot select a teacher, organization, year or class.
Every query includes both teacher ownership and class organization. Read the four
aggregates in one repeatable-read transaction and mark the response private,
no-store. The timestamp is the generation start time, shown in UTC.

| Metric | Definition |
| --- | --- |
| Active classes | Existing Class rows with isArchived=false in the authorized scope. Deleted rows are absent. |
| Distinct enrolled students | Active STUDENT memberships in the same organization currently enrolled in scoped classes, distinct by userId. A student enrolled in two classes counts once. Removed and inactive enrollments are excluded. |
| Assignments | Existing ClassAssignment deployments attached to scoped classes. Scheduled assignments count. The same Assignment deployed to two classes counts twice. Deleted deployments are absent; Assignment and ClassAssignment have no archive field. Archiving an AssignmentType does not remove its existing assignments. |
| Submitted writing | Distinct non-deleted, non-archived Document rows attached to scoped ClassAssignment rows with at least one Submission whose archivedAt and unsubmittedAt are null. Solo documents must belong to a student membership in the same organization; group artifacts must have their persisted DocumentGroup owner. Repeated submissions and DocumentRevision rows do not increase this count. A shared group document counts once. Existing active work remains included if its student has since left the roster. |

Independent documents, writing practice and drafts without a qualifying submission
are excluded. These counts are current records, not lifetime usage meters or a
date-range activity history. A submission withdrawn after an earlier still-active
submission does not erase that earlier qualifying submission. All-zero and partial
activity are valid. No AI or external service is used to prepare or share the report.

## Authorization

The report loader independently calls requireUserId, requireMembership,
requireFreeTierEnabled and enforceFreeTierTeacherGate. It requires an active
TEACHER membership and FREE_CLASSROOM plan before aggregation, including on direct
single-fetch requests that do not run the app layout loader. Existing onboarding,
approval, expiry and membership licensing behavior is retained. Students and paid
accounts receive no new navigation. Another teacher can read only their own scope.

## Local verification

Use the project CLI to prepare an isolated worktree runtime/database. Run the
three focused test files separately so route module mocks stay isolated:

```
CI=1 bun test app/utils/classroom-report.test.ts app/utils/classroom-report.server.test.ts
CI=1 bun test app/routes/app.classroom-report/route.test.ts
```

From services/web-app, with E2E_DATABASE_URL pointing to the disposable local
database and REPORT_BASE_URL to its running CLI runtime:

```
CI=1 playwright test --config playwright.classroom-report.config.ts --workers=1
```

The browser suite creates report-local-* fixture accounts in a **local database
only**. Repeated runs replace only those fixtures. It uses persisted records,
normal password login and the actual route implementation. Its primary fixture
contains two active classes in different years, the same two active enrolled
students plus an inactive enrollment in both classes, two deployments of one
assignment, three submitted documents (one with three submissions and a revision,
one solo in the second class, one shared by two students), plus archived/deleted
documents, withdrawn/archived submissions and an unsubmitted draft. Separate
fixtures cover an archived class, another teacher, another organization, a student,
a paid teacher and an empty class. Expected primary counts: **2 / 2 / 2 / 3**;
empty-class counts: **1 / 0 / 0 / 0**; archiving the empty class gives four zeros.
The two active classes deliberately model existing records beyond today's
one-class creation cap; fixtures do not change entitlements or exercise a cap bypass.

REPORT_BEFORE=1 captures the original entry surface; REPORT_SHOTS writes screenshots
and a JSONL manifest containing SHA, URL, viewport, time and fixture provenance.
Desktop/mobile copy success and denial use browser clipboard stubs to make both
permission paths deterministic, then assert the exact shared text. Browser print
is observed at window.print and captured using print media; native operating-system
dialogs are not automated. No hosted acceptance or preview is part of this suite.
