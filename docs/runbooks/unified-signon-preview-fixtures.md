# Unified sign-on disposable preview fixtures

This seed supplies the data prerequisite from historical
`shots/di-signon-hosted-qa/RESULTS.md` (30 decision rows and signon-33–44 class
transitions). Local fixture/handler evidence does **not** turn any historical
hosted blocked case into a pass. Refresh #565 and run the full hosted matrix only
under the separate `di-signon-hosted-qa` task after driver merge.

## Isolation and repeatability

`packages/prisma/scripts/seed-preview-signon-qa.ts` runs only with all of:

- `YAWP_ENVIRONMENT=preview`, `PREVIEW_DATA_MODE=seed`, `PREVIEW_SLUG=pr-N`.
- Exact PostgreSQL database `yawp_pr_N`, matching role `yawp_pr_N_app`, host
  `preview-postgres` (or explicit loopback for a disposable lane database).
- No URL query, fragment, schema override, remote host or privileged generic role.
- Actual `current_database()` and `current_user` match the validated target.

Demo, production, shared local-dev, malformed targets and connection mismatches
are rejected before fixture writes. The deployment hook runs only for PR seed
mode, both after migrations and when tooling is unchanged; it fails the deployment
on error. No shared seed imports this module. No feature flag, existing dev
persona, credential, session, sign-on identity, provider config or email is changed.
The helper never changes a password or existing fixture record on rerun.

Stable IDs start `preview-signon-qa-`; emails below use suffix
`@signon.preview.yawp.invalid`. Every account with a password uses the existing
local-dev fixture password (AGENTS.md). `passwordless*` accounts have no Password
row. Invitations have private random legacy secrets; unified entry obtains its
own fresh code through the normal mail handler. Active invitations expire in
2099; expired invitations in 2000. Reservation invitations use the real seat-cap
relationship and do not send mail. Identity/trial/invitation collisions abort the
entire transaction without modifying the other account.

Rerun in the **same eligible disposable target** with the existing deployment
environment: `bun run --cwd packages/prisma seed-preview-signon-qa`. Rerun creates
missing records and preserves existing records, including exercised passwords,
trial decisions and roster changes. It is not an account reset command. For a
clean matrix reset, discard/recreate that disposable PR database using the
existing preview reset procedure, then let the normal preview seed path run.
That hosted operation needs the separate task's authorization. Locally recreate
only the lane-owned database, migrate and apply local-dev there, then apply this
seed with the guards above. Never point a reset at demo, production or another
lane's database. Do not delete namespaces from a shared database.

## Existing access/context prerequisites

In deployed **seed mode**, enter the existing master preview access code at
`/auth/preview-access`, then use its ordinary organization picker to select
`Preview QA school`, `Preview QA free`, `Preview QA second` or `Preview QA partner`
as indicated. Fixture organizations deliberately have no public access codes.
Do not paste access codes, cookies or captured sign-in codes into evidence.
An ordinary default-seat code cannot reach accounts in these separate fixture
organizations. No master credential is created by this change.

The existing preview seat policy filters active memberships to the selected
organization, with at most one membership per user/organization. Therefore **row
21's multi-membership picker cannot be reached in hosted seed mode**, even though
the data exists and its normal-runtime handler is verified locally. **Row 22's
truly inactive/orphan account cannot pass legacy password sign-in in this mode**.
These remain hosted blockers requiring a separately reviewed preview-policy
change, never an auth bypass. Ungated local evidence proves the fixture/data
branch only. Tests also prove the deployed policy restrictions remain in force.

UA codes are environment configuration, not a database model. Organization
`preview-signon-qa-partner`, student `partner-student` and invitation `partner-invite`
are supplied. The deployment owner must use the supported `PREVIEW_UA_ORGANIZATION_ID`,
`PREVIEW_UA_STUDENT_BILLING_ENABLED=true` and existing `PREVIEW_UA_PARTNER_CODE`
inputs (plus the existing required `PREVIEW_STRIPE_*` inputs). The renderer maps
these to runtime UA variables and derives `UA_PARTNER_HOSTNAME` from the UA
preview hostname; the browser must use that actual host. Seed data cannot supply DNS,
TLS, host routing, a UA cookie or payment-provider credentials. Enter the code
through the real partner entry; that handler issues the cookie. Local tests use
localhost and a disposable code, verify proof before signup and the `/billing/ua`
destination; they do not complete a real payment. No UA config is changed here.

Live Google cases need an authorized human account, configured OAuth client and
matching redirect URI. Do not pre-link a fabricated subject or automate human
Google login. This PR neither changes Google credentials nor calls its provider.

## Row-to-fixture inventory

`email` means enter the email at `/auth/login`; `password → continue` means the
normal password form and `/auth/login?continue=1`. Select the listed organization
with existing master access when running the hosted seed-mode target.

| Row | Identifiers / records | Normal route and expected result | Prerequisite / reset impact |
| --- | --- | --- | --- |
| 1 | `QA-EMAIL-101`, `QA-MULTI-101`; classes `email`, `multiple-a/b` | identifier → class found; repeated code → choose among permitted classes → email proof → account | school organization; use fresh unknown address after signup |
| 2 | `invited-student`; invitation → `email` class | email → activation → code → name/password → class enrollment | private OTP; invitation consumed on completion |
| 3 | bare `qa-handle` (both username and free class code) | ambiguity → choose class → handle registration → joined | free organization; choose a fresh allowed handle |
| 4 | absent `new-teacher` email; `trial-lead` | unknown email → account type → teacher → existing `/free` entry | free-tier flag/config as existing preview seed provides; do not submit real mail |
| 5 | `trial-invited`, INVITED application | email → teacher/status branch → code proof → trial status | private OTP; no status before proof |
| 6 | same `trial-invited` | proved status → resend existing release invitation contract | signer + preview mail capture; request creates normal signed link, no provider mail |
| 7 | `trial-account_created`, teacher membership | password → continue → `/app/free-tier/onboarding` | second organization |
| 8 | `trial-sent`, `trial-manual_review` | password → continue → `/app/free-tier/pending` | second organization |
| 9 | `trial-approved` | password → continue → requested `/app/my-classes` | school organization |
| 10 | `trial-rejected` | password → continue → `/app/free-tier/status` | second organization |
| 11 | `trial-expired` | password → continue → `/app/free-tier/status` | second organization |
| 12 | `invited-student`, `invited-multiple`, `invited-teacher`, `passwordless-teacher` | activation → proof → student class choice or existing teacher location selector | school organization; teacher invitation has two locations; consumed invitation needs clean reset |
| 13 | `password` | email → password → continue → safe destination | school organization |
| 14 | `password` or an operator-approved email account | Google matching existing email → explicit account proof → link | human Google + provider configuration; fixture email is deliberately non-deliverable |
| 15 | `passwordless` (active student, no Password) | activation → code proof → name/password; membership retained | school organization; setup mutates account, reset for repeat |
| 16 | application `trial-sent`, approval `admin-approval`, admin `approval-admin` | existing signed `/free/admin/approve?t=…` loader | private link helper below; link consumed by decision, no mail |
| 17 | `staff` | password → continue → safe active teacher route | school organization |
| 18 | `password`, class `QA-EMAIL-101` | code → existing student sign-in → joined/already member | school organization; real email class relation already present |
| 19 | `@qa-handle`, `forced` | handle password → class continuation; forced email password → `/auth/required-password-change` | free / school organization respectively; password change needs reset |
| 20 | `qa-handle` free class; unknown Google email | provider account choice; handle-only class keeps existing boundaries | human Google; free organization; email-less handle cannot be Google email-linked |
| 21 | `multiple`, active school STUDENT + second TEACHER, inactive free membership | normal runtime password → membership picker; choose only owned active ID | **hosted seed seat policy blocker** above; local branch verified |
| 22 | `inactive` (inactive student), `unassigned` (active student with no class), `orphan` (no membership) | normal runtime inactive/recovery branch; class recovery where handler permits | **hosted inactive/orphan sign-in blocker**; unassigned still has one active organization membership |
| 23 | absent `new-student`, `QA-EMAIL-101` | account choice → student → code → email proof → name/password | school organization; private OTP; fresh email each completed signup |
| 24 | absent operator Google email + `QA-EMAIL-101` | verified provider identity → name-only signup → class | human Google; no fabricated provider identities seeded |
| 25 | `expired-invite`, `expired-invite-mobile` | activation reveals no expiry → code proof → expired variant; create-account rejected | private OTP; separate mobile recipient avoids cooldown; seed expiry fixed in past; code expiry is generated/waited, not preseeded |
| 26 | `@qa-handle`, bare `qa-handle`, case variants | explicit handle → password; bare code/handle → ambiguity | free organization; canonical username is lowercase |
| 27 | empty / invalid email / invalid handle / unknown class code | existing client/server validation | no account fixture required |
| 28 | `passwordless` / `expired-invite` | send normal code, wrong attempts, cooldown, fresh challenge / expiry | private OTP; never capture code-filled input; restart browser creates new flow, rate windows still apply |
| 29 | partner organization, `partner-student`, `partner-invite`, absent `partner-new` | partner host → organization code → email proof → `/billing/ua` | **UA host/env/payment prerequisites** above; no fake cookie/header |
| 30 | `password` with real session from row 13 | authenticated entry → safe retained destination; unsafe redirect rejected | school organization; session created only by normal sign-in |

## Class-code transition setup (signon-33–44)

- Typed paid-context code: `QA-EMAIL-101` → class found → email activation; unknown
  student email can choose student and enter the same code.
- Typed free class: bare `qa-handle` → ambiguity; choose class, then register a new
  handle through the existing form. Explicit `@qa-handle` means the existing user.
- Several matches: `QA-MULTI-101` has two nonarchived classes in separate locations
  and organizations. The normal handler issues current candidate IDs; arbitrary
  or archived choices fail. Locally archive only fixture class `multiple-b` after
  resolving and before choosing to test stale selection, then restore it. Hosted
  archiving requires normal administrative access/authorization; the seed does
  not expose a mutation endpoint or accept posted auth context.
- Full class: `QA-FULL-101` has 35 active pending invitations, each with
  `studentClassId=preview-signon-qa-full-class`; resolve shows full.
- Seat race: `QA-RACE-101` has 34 pending reservations. Open two independent normal
  browser flows while one seat remains; complete handle signup in the first,
  then submit the second stale registration. The second must report full and
  create no account. A completed race uses the remaining seat; use a clean
  disposable reset for another run. The integration test removes only its own
  two disposable racer registrations before repeating.
- Email/Google class continuation uses the same classes, invitation context and
  normal proof handlers. Invalid code reentry needs no fixture; Google completion
  still needs human login. No presentation state selectors are used.

## Private approval-link preparation

The deterministic PENDING approval is seeded without sending a message. A signed
link must be minted using the existing runtime signer; raw signed URLs are never
committed or printed. From `services/web-app`, with an eligible disposable PR
target and existing `PREVIEW_ACCESS_SECRET` (or `FREE_TIER_LINK_HMAC_SECRET`) loaded:

```sh
bun run scripts/preview-signon-approval-link.ts "$TMPDIR/approval-link"
```

Read that private 0600 file only in the authorized browser harness and delete it
after use. The helper requires an existing PENDING fixture approval, uses
`mintSignedLink`, updates only that fixture approval, and refuses output outside
`$TMPDIR` or overwriting an existing file. It creates no mail. This is an operator
command, not an HTTP endpoint, automatic sign-in or deployment action. A hosted
operator still needs separately authorized execution and a private retrieval path.

## Local evidence and checks

Run `./bin/project capabilities --json`, `doctor`, bootstrap one fresh lane
worktree and `fixture verify local-dev`. Allocate a separate disposable
`yawp_pr_999565` DB/role in that lane container, migrate and apply local-dev there;
never modify the generated shared seed itself. With its loopback URL loaded:

```sh
CI=1 SIGNON_PREVIEW_FIXTURE_TEST=1 ./bin/project test --profile unified-signon-preview-fixtures --json
CI=1 ./bin/project test --profile typecheck --json
```

The profile includes guard/deployment tests, flag-OFF dispatch regression tests,
and opt-in real-database tests. CI creates/destroys its own database/role and runs
the same profile. Browser tests use `playwright.preview-fixtures.config.ts`,
`--workers=1`, desktop 1280 and mobile 390. Start/stop the server with project CLI
in one process lifecycle; use `SIGNON_FIXTURE_PHASE=before` against the unseeded
lane DB and `after` against the fixture DB. Only enable the flag in these local
disposable databases. Private local mail capture lives under `$TMPDIR` and is
removed after. The seed itself never enables any flag.

Evidence is lane-local `shots/di-signon-preview-fixtures/`; the shared shots path
is outside writable roots. Adjacent v2 design, implementation and side-by-side
images compare representative states; a local membership picker image is
explicitly ungated evidence, not proof of hosted seat compatibility. Stop all
owned servers, Chromium, runners and the disposable database container; delete
private captures/caches/env/test output before handoff.
