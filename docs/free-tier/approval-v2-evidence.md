# Local approval evidence

Worktree: `fto-approval-page`, fresh from `origin/main` 6378459f. All verification
uses isolated local Postgres on port 54343 and the project CLI's owned server on
5199. Actual email delivery is mocked in database tests and captured locally in
browser QA. No hosted credentials, preview activity or environment writes.

## Checks

- `CI=1 ./bin/project test --profile free-tier-approval-unit --json`: focused
  lifecycle, input/mailto, route, legacy approval, Internal operator and transport
  tests, each in its own process to isolate module mocks.
- `CI=1 NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json`:
  full typecheck passes; existing duplicate LTI route warnings remain.
- `CI=1 ./bin/project test --profile project-cli --json`: 104 tests pass, including
  real runner discovery proving standard browser runs exclude the mutation spec
  and the dedicated profile discovers six flows without starting a server.
- `CI=1 PW_EXECUTABLE_PATH=<installed Chromium> ./bin/project test --profile free-tier-approval-browser --json`:
  six one-worker desktop/mobile flows pass, captured with installed Chromium 1248.
  The runner closes the browser and explicitly stops its owned server in `finally`.

Bootstrap uses `XDG_CACHE_HOME`, `BUN_TMPDIR`, `BUN_INSTALL_CACHE_DIR` under
`$TMPDIR`; no runtime version or browser installation is changed. The initial
Bun install required copyfile recovery for a missing package, in this worktree
only. Local fixture seeding includes the existing free-classroom bundle so legacy
approval provisioning runs against complete data.

## Screenshot provenance

Read `/home/bryant/work/yawp/codex-loop/lanes/design-impl/design/v2/DIFF.md` and
artboards freetier-09..14 PNG/DOM/text. The preserved sign-in form system specifies
320 px cards, 24 px card padding, 18 px headings, 40 px inputs, warm neutral tokens
and restrained controls. Brian-call requirements add sent dates, direct mailto,
forwarding, and the administrator information-left/form-right layout. These
extensions intentionally differ from the older single-column reference boards.
The administrator guide slot remains empty pending supplied content.

Evidence is in the writable lane directory:
`/home/bryant/work/yawp/codex-loop/lanes/di-freetier-inapp/shots/fto-approval-page/`.
The shared top-level `codex-loop/shots/` is outside this builder's writable roots.
Each canonical artboard has `-design.png`, `-impl.png`, `-side-by-side.png`.
Additional 1280/390 captures cover before/after waiting and admin layout, teacher
and admin forwarding forms, native validation, successful queued forwarding,
replaced/invalid links, waiting review/rejected/expired/approved states, flag-off,
non-target organization and paid membership controls. Compositions preserve the
full reference and implementation with explicit labels; originals retain their
native resolution. `checks/` holds final transcripts and initial red-test evidence.

Historical merge hold is released. The driver requires exact-head independent
Ship Review APPROVE, green CI and valid manager snapshot confirmation before merge. An RDS snapshot is required before
applying the additive migration to production. No environment flag is enabled.

## Review corrections, October 16

The three P2 findings in lane `state/REVIEW.md` at `388b78ba` are addressed by
`9ebba777` (failing regressions) and `3a60b7a4` (implementation). Every eligibility
check recovers successful legacy reminders after rollout pauses without counting
delivery-backed logs twice. Recovered accepted-send times enforce the ten-minute
cooldown. Deliveries persist immutable acceptance count/cadence for idempotent
replays. A second additive migration backfills earlier accepted slots; it was
applied only to isolated local Postgres.

Final local validation: 68 focused tests pass, including 18 durable lifecycle
cases; full typecheck passes with the existing duplicate LTI route warnings.
Five added cases cover pause/re-enable at the shared cap, legacy cooldown just
before/at ten minutes, replay after later manual/automatic sends, a queued job
resuming after a legacy send, and the real acceptance backfill against older
deliveries. The database suite uses a unique targeted rollout to exclude unrelated
local fixtures. An independent Ship Reviewer also ran all 68 focused tests and
full typecheck successfully.

Six one-worker local Playwright flows pass on the corrected implementation.
The first run had five passing flows and an aggregate test timeout during a
desktop administrator screenshot while typecheck was running; the isolated rerun
passed all six in 23 seconds. No product code or timeout was changed for the rerun.
Fresh desktop/mobile before/after, validation, forwarding, terminal, flag-off,
non-target and paid-member captures are in `shots/fto-approval-page/review-fix/`
under the writable lane. That directory includes six canonical design,
implementation and side-by-side sets, four flag-off/flag-on comparisons, and
`checks/` with red-regression, focused-test, typecheck and browser transcripts.
The all-states references use representative mobile captures; the other states
are saved separately. Earlier complete evidence remains in the parent directory.

Driver `state/REVIEW.md` remains untouched; a fresh standalone Ship Review records
the resulting head in `state/SHIP_REVIEW.md`. The historical merge hold is now released. No hosted
environment was accessed, and no actual email, remote migration, flag activation,
preview action or merge was performed.

## Claim-time rollout pause correction

The follow-up rejection in lane `state/REVIEW.md` is reproduced by four real
Postgres regressions: automatic/manual reminders crossed with flag-off/untargeted
pauses. A fixture-scoped trigger changes the rollout in the actual claim
transaction. On the original implementation all four fail with CANCELLED instead
of QUEUED, after zero provider calls. The trigger/function are removed in finally.

The dispatch transaction now restores a known-unsent delivery to QUEUED, clears
its claim timestamp and reverses that claim's attempt increment. Concurrent
resumed drains accept the original slot once; manual replay returns the same
acceptance and a fresh key works at the cooldown boundary. No migration is added
by this correction. Abandoned claims and ambiguous provider attempts retain the
existing uncertainty policy.

At application head `bb7a9a60`, the project CLI reports 72 focused tests passing
(including 22 durable lifecycle cases), full typecheck passing, and six local
one-worker Playwright flows passing in 22.6 seconds. Fresh evidence lives in the
sibling `rollout-pause/` directory: 37 original captures, six canonical v2 artboard
sets, four flag-off/flag-on compositions, and `checks/` red/green/typecheck/browser
transcripts. Earlier evidence remains available for comparison. No UI code
changed in this correction. Independent Ship Review results are recorded in lane
`state/SHIP_REVIEW.md` for the final reviewed head.

## Rebase onto merged onboarding and guard contracts

Rebased the existing PR #581 branch onto `3656601963e942e3772ba1f950ec2cfc59cc0049`.
Recovery branch `recovery/fto-approval-page-before-rebase-20261016` preserves
`19707bddd442f7c5b0036c3f1429c3ddcebff928`. The source revision for refreshed
captures and final published head are recorded by the evidence manifest and
lane `state/BUILD_RESULT.md`. The CI fixture correction below changes only
test tooling; approval application source and production migration SQL stay intact. Conflict repair retains main's class-preparation and
below-HS reopen guards, all shared schema additions, both CI registrations and
all dedicated/standard browser discovery exclusions. Durable approval source,
its 22 lifecycle tests and both migration SQL files are unchanged by the rebase.

Renewed checks through `./bin/project` with `CI=1`:

- 72 approval tests pass, including all 22 durable delivery cases and the 30
  legacy approval database cases. Email is mocked or captured locally.
- 108 project CLI/contract checks pass, including standard-runner discovery.
- Main class-step compatibility: 57 pass, 15 legacy DB cases skipped in that
  profile; those legacy cases pass separately in the approval profile above.
- Full typecheck passes; existing duplicate LTI route warnings remain.
- All six one-worker local Playwright flows pass in 25.7 seconds: desktop/mobile
  waiting/date/mailto, forwarding and validation, old-link rejection,
  administrator form/guide slot, terminal states, flag-off, untargeted and paid
  membership controls. The owned server is stopped by the runner.

Evidence under lane `shots/fto-approval-page/rebase/` contains 37 original local
captures, six design/implementation/side-by-side sets, four flag-off/on
comparisons and permanent check transcripts. References are v2 freetier-09..14
DOM/text/PNG. Compositions label representative states and Brian-call extensions;
they do not claim exact artboards exist for the added sent-date/direct-email or
information-left administrator layout. Original captures keep native resolution.
The manifest records final head/base, screenshot hashes, local ports and command
provenance. Prior `rollout-pause/` evidence is preserved.

The manager released the merge hold. Fresh independent Ship Review and relevant
GitHub CI must name the final head; historical approval does not satisfy those
gates. The driver alone verifies the available manager RDS snapshot and its
six-hour validity window, takes the merge lock and merges. Exact additive SQL is
in lane `state/NEEDS_SNAPSHOT.md`. No production migration, flag activation,
actual email delivery, hosted preview, remote environment change or merge.

Main advanced with the signed duplicate-class-code API (#590) during the first
verification pass. A second minimal rebase retained its new CLI profile catalog
entries alongside approval profiles. Earlier first-rebase checks are preserved
under `checks/first-rebase/`; final-base transcripts are in `checks/`. Fresh
screenshots are recaptured on the second rebase and final-head independent
verification is recorded separately in `state/SHIP_REVIEW.md`.

## Required CI historical rollback fixture correction

Required Migration Integration exposed a legacy #416 rollback fixture failure:
it deploys all current migrations, then drops the approval table while the newer
`FreeTierApprovalDelivery` foreign key still references it. The existing test
fails locally with that exact dependency error before the correction. It now
asserts the outbox exists and explicitly removes that newer dependent table in
the isolated test fixture before exercising the historical rollback. No CASCADE,
production rollback or production migration SQL is changed.

`CI=1 ./bin/project test --profile free-tier-approval-migration --json` selects
only this historical case using the worktree's loopback Postgres host/port and
the suite's dedicated `yawp_migration_integration` database. This avoids touching
the approval fixture database or running unrelated migration cases locally.
The corrected case passes, as do all 108 CLI/contract checks, including catalog,
help and browser-discovery coverage. Red/green and CI-failure evidence is in
`rebase/checks/`. Required full migration CI still owns the broader suite.

## Self-forwarding review correction

The latest driver REJECT for slug `fto-approval-page` reproduced a teacher
forwarding the request to their own mailbox on demo and then approving it.
The shared `selfAdminEmailError` guard now runs inside the locked forwarding
transaction before runtime email evaluation, token consumption or any mutation.
It applies to authenticated teachers and both signed administrator link purposes;
demo's manual-review bypass cannot bypass the mailbox check.

Six new real-database cases cross demo/production with teacher, ADMIN_APPROVE
and ADMIN_NOT_RIGHT_PERSON entry points. Each tries the exact mailbox, case and
whitespace variants, plus aliases, Gmail dots and googlemail aliases. Rejection
preserves a complete application snapshot including both valid signed links,
approval history, existing queued delivery slots, decisions and email logs; no
email is sent. All six cases fail on the old implementation and pass with the
shared guard. The focused profile now passes 78 cases (28 durable lifecycle).

The six existing local desktop/mobile browser flows also exercise rejection of
self-forwarding before a valid forward. Each fixture uses an independent local
IP budget to avoid sharing the application's three-per-minute forwarding limit.
Application rate limits remain unchanged. Fresh screenshots, red/green proof,
CLI/typecheck/browser transcripts and exact-head/hash provenance are in lane
`shots/fto-approval-page/self-forward/`; prior `rebase/` and `rollout-pause/`
evidence is preserved. Driver review, final-head CI and snapshot gates are
recorded in lane state files. No migration SQL or rollout default changes.
