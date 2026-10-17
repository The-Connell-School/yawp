# Free tier class preparation

The default-off `FREE_TIER_ONBOARDING_V2_FLAG` adds class preparation before the administrator request for eligible `ACCOUNT_CREATED` applications. The name and grade are stored on the authenticated teacher's application. Preparation leaves application status, permissions, class capacity, and email untouched. Existing administrator requests, review decisions, and provisioned classes continue through their existing lifecycle.

Two nullable application columns are the only schema additions. The existing provisioning transaction and advisory lock create the single starter class after approval, using validated preparation only when the flag is enabled. Repeated saves and provisioning retries cannot create additional classes. Existing paid memberships are excluded. When the flag is off, provisioning retains `My Class` and the legacy administrator form remains unchanged.

## Local checks

Use the worktree's isolated database and the supported project CLI:

```bash
CI=1 ./bin/project bootstrap --fresh --json
CI=1 CLASS_STEP_DB_TESTS=1 FREE_TIER_DB_TESTS=1 ./bin/project test --profile free-tier-class-step-unit --json
CI=1 NODE_OPTIONS=--max-old-space-size=4096 ./bin/project test --profile typecheck --json
CI=1 ./bin/project test --profile project-cli --json
CI=1 CLASS_STEP_EVIDENCE_DIR="$LANE_SHOTS/fto-create-class-step" ./bin/project test --profile free-tier-class-step-browser --json
```

The browser profile uses one worker, the owned local server, a disposable database, and captured mail. It covers both viewports, supported and unsupported grade prefill, associated validation errors, keyboard focus, persistence, back navigation, direct administrator and pending POSTs, unauthenticated access, approval through a captured link, prepared starter-class values, one-class provisioning, request retries, existing pending requests, and legacy flag-off rendering. Service tests additionally cover ownership, concurrent saves/provisioning, every in-flight state, paid membership exclusion, and flag-off provisioning. The existing approval-flow and internal approval regressions run separately to isolate their mocks. CI runs the new real-database suite in its own process.

Review correction: the standard Playwright runner excludes the class-step spec because its mutation fixtures require the dedicated worktree server/database lifecycle. The spec rejects a missing dedicated port before constructing its database client and preserves an explicitly supplied `E2E_DATABASE_URL`. A project CLI regression lists both runner configurations with an explicit unreachable E2E connection and no development connection: the standard runner discovers zero class-step tests, while the dedicated runner discovers all five without running hooks or starting a server. Fresh correction transcripts are `checks/review-runner-{cli,browser,typecheck}.log`; refreshed desktop/mobile captures and comparisons are in `review-fix/` under the evidence directory.

## Design evidence

Evidence is lane-local at `lanes/di-freetier-inapp/shots/fto-create-class-step/`:

- `1280-` and `390-` create-class, grade-selection, validation, and administrator states.
- `1280-legacy-impl.png` records flag-off parity with the existing administrator screen.
- Each state has `-design.png`, `-impl.png`, and `-side-by-side.png` files; check transcripts are under `checks/`.

Read v2 `DIFF.md`, artboard 07's desktop DOM/text, and artboard 08's state DOM/text. Board 07 is the existing approval/form reference: 320 px card, 24 px padding, 18 px heading, 40 px controls, and the sign-in shell's colors and spacing. Create-class and the revised administrator timeline are new Brian-call states with no exact artboard. Their comparison images explicitly label board 07 as a form-system reference, rather than claiming an exact layout/copy match. Native desktop and mobile implementation screenshots are preserved alongside those references.

The driver must obtain green required CI and independent Ship Review approval for the final head before merge. The manager released the Friday intern-session merge hold on 2026-10-16 at 15:12 CDT; review, CI, and snapshot gates remain. The driver owns the production RDS snapshot before applying this additive migration. No remote environment or flag is changed by this work.

## Rebase verification

Rebased the existing PR onto main `9dfdc1ca`. Preserve main's self-administrator
email rejection, HTTP 400 and field errors (#583), transaction-aware class-code
generation (#576), and all sign-on, class-code, grade-decline and demo-feedback
CLI profiles. No auth or unified-sign-on source changes are part of this PR.

Class-step capability and help advertising is composed after the existing shared
lists. These additions leave main's shared profile/help lines unchanged, avoiding
repeat conflicts as other profiles arrive. A regression checks both advertised
profiles through capabilities and actual CLI help. Standard discovery still excludes
the dedicated mutation suite; missing CLASS_STEP_PORT still fails before database
client construction, and explicit E2E_DATABASE_URL remains preserved.

Latest exact-head transcripts, manifest and local screenshots are in
`shots/fto-create-class-step/rebase/main-9dfdc1ca/`; earlier evidence remains in the
parent rebase directory. The focused profile also includes existing administrator
email policy/route and real-database class-code provisioning regressions. Its route
fixture models the default-off setting lookup and expanded select without weakening
any rejection assertion.

Dedicated browser flows cover desktop/mobile preparation, persistence, validation,
direct navigation/POST boundaries, administrator progression, single-class provisioning,
flag-off and paid-member controls. They assert self-administrator POST rejection and
associated UI errors before accepting a distinct administrator, with no approval/email
or application-state side effects on rejection. Twelve design/implementation/comparison
sets preserve the v2 form reference and explicitly label new Brian-call states that
have no exact artboard. Ship Review must name the exact final head, all required CI
must pass, and the driver retains the production RDS snapshot and merge gates.
