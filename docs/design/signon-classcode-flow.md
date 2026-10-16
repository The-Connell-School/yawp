# Class-code student sign-in

Everything is behind `unified-sign-on`, default OFF. No demo or production flag
changes, hosted requests, email delivery or OAuth credential access are needed.

Brian's October 16 decisions override older signon artboard copy: entry says
“Email or class code”; a class offers New / Returning; all new class-code students
enter first name, last name and password confirmation, with an automatically
assigned handle. Returning students use handle + password in the chosen class.
Google with no account first asks for a class code, then follows the same flow.

The signon-03/04, 33/34, 35/36, 37/38 and 41/42 v2 references remain the layout,
token and component references. Existing card width, surfaces, borders, typography,
focus rings and compact fields are reused. Intended differences are the revised
labels/choices, separate name fields, generated-handle preview and confirmation,
and the single returning handle/password form. A full class still allows an
already enrolled student to sign in. Screenshots include flag-off legacy login.

## Identity and deployment

The additive `ClassStudentHandle` table has unique (classId, handleKey) and
(classId, userId) constraints, foreign keys and a userId index. Both impersonation mutation-audit
and truncate-guard triggers are installed when the table is created. Handles preserve
name casing, fold accents, omit spaces/apostrophes/hyphens, support Unicode
letters, contain at least the two required names' letters and at most 30 Unicode
characters. Names accept 1–80 characters of letters with internal separators.
Comparison is Unicode-normalized and case-insensitive. Collision attempts are
base, base1 … base99, truncating the base to keep the suffix within 30 characters.
Exhaustion fails without any partial account or enrollment.

A class row lock serializes generated aliases and seat allocation. Account,
password, membership, alias and optional Google subject are written in the same
flow transaction. Database constraint errors roll everything back. A generated
handle is shown before the explicit session continuation. Google email is not
saved in the student flow, user, alias or provider identity. A preexisting account
with matching Google email still requires its own proof and explicit linking;
linked subjects keep their existing sign-in path.

Legacy User.username remains unique and is dual-written with an available global
username (an opaque suffix when necessary). Class aliases are authoritative in the
new form. The legacy username may differ from the alias if another class owns
that global name; rollback users can use their legacy roster username. This
preserves legacy login and teacher password-reset support, including existing
accounts. An authorized teacher reset clears the legacy login target plus the
class-scoped alias and legacy-handle targets for all active student enrollments.
Other students' targets and shared IP abuse controls retain their budgets. The
login and reset paths share one normalization helper for those targets. No old identities are renamed or migrated. Returning class login can
also resolve existing enrolled legacy handles. Ambiguous alias/legacy ownership
fails closed. It never enrolls a newly authenticated account into a different
class. Password policy, failed-login limits, active membership requirements,
preview restrictions and forced password changes remain enforced.

Driver deployment requirement: take an RDS snapshot before applying the additive
migration to production. Apply the migration before enabling the flag anywhere.
No production migration ran in this cycle. Independent Ship Review APPROVE and
green CI are required before driver merge. Separate PR #576 still needs driver
conflict resolution; this task does not rebuild class-code uniqueness.

## Local checks

Use `CI=1 ./bin/project bootstrap --fresh --json`, then source the generated local
config without printing it. With `CI=1 SIGNON_LOCAL_TEST=1`, run
`./bin/project test --profile signon-classcode --json` and the typecheck profile.
For browser checks start the server through `./bin/project dev start --json`, set
`E2E_DATABASE_URL`, `E2E_BASE_URL` to that local server and `SIGNON_EVIDENCE_DIR`,
then use the same profile with `SIGNON_BROWSER_TEST=1` or the dedicated Playwright
config with one worker. Stop the server through the CLI afterward. The test
fixtures refuse non-local databases. Mocked Google tests verify signed local JWTs
and never request a real provider or deliver email.

Evidence is stored under the lane's `shots/signon-classcode-flow/` directory.
The `*-design.png` files come from `lanes/design-impl/design/v2/artboards/`.
`*-before.png` captures use the original merged sign-on component against the
same disposable local server; implementation captures use the revised forms.
Side-by-side images pair each revised desktop screen with its corresponding v2
reference. Mobile reference boards contain multiple states; the evidence notes
identify the relevant state rather than claiming a pixel match to the montage.

Validation after review fixes: 126 focused checks pass (1 route contract,
3 login-target normalization, 7 existing student-join, 3 generated-handle,
3 policy, 14 Google provider, 43 dispatch/flag/origin, 14 class-student database
scenarios and 38 existing sign-on database cases). The project CLI profile adds
103 passing contract checks. Typecheck passes with a 4 GB Node heap inside the
6 GB lane limit; its existing duplicate LTI route-ID warnings remain.

The four new database regressions first failed against the reviewed head. They
cover both target and per-IP/handle lockouts, authorized and denied resets,
multiple enrolled classes, another student's same handle in a different class,
normalized alias input and temporary-password continuation; anonymous flag-off
join and read-only mutation rejection; and exact trigger coverage plus attributed
create/update/delete, rollback, denied truncation and ordinary-write isolation.
The existing coverage guard is unchanged. The browser focus regression now waits
for enabled inputs to commit before focusing the first server-reported error;
clearing an error while typing does not move focus. The table-specific trigger tests run
against fresh migrations. A metadata-only local query also found 26 pre-existing
application tables without full trigger coverage, including SignonFlow and
SignonIdentity; these remain a separate driver follow-up. No exemptions were
added for ClassStudentHandle or any other table.

Local browser evidence retains the original 2 before captures and 2 Google
regressions, with refreshed class-code and mocked-Google screenshots at 1280 and
390 using one worker. Hosted demo and production checks remain excluded by task
scope. Green CI and independent Ship Review are driver merge gates.

Local setup needed a temporary hoisted dependency layout after the default
isolated install timed out; stale workspace links were moved aside. Prisma's
read-only global engine cache was copied to lane-private XDG cache storage.
No setup-script changes remain in the PR. Generated clients, route types,
browser output, runtime caches and temporary logs were kept in `$TMPDIR`.

Review follow-up source: lane `state/REVIEW.md` REJECT for slug
`signon-classcode-flow`, PR #577. No matching QA FAILURES.md entry was supplied.
The same class-student database file, login-target tests and student-join unit
tests now run in the required Prisma migrations CI job. `/join` calls the
existing mutable-request guard before its anonymous check; the route-contract
allowlist and the impersonation coverage guard retain their original rules.

The required CI job reached two older fixture expectations after the initial
review fixes: class-code/handle ambiguity and manual-handle race registration.
Those tests now assert class-code precedence, Returning authentication of the
existing legacy handle, explicit New selection, generated-handle confirmation
and continuation, and rollback for a stale last-seat registration. Fixture data
and preview access policy are unchanged. The local
`unified-signon-preview-fixtures` profile passes all 95 checks (31 guards,
43 dispatch, 9 fixture database and 12 seat-policy database cases) against a
disposable loopback database with its own fixture-only database role. The
43 dispatch checks overlap the class-code profile. No hosted preview is used.
