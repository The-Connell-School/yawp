# Free-tier presentation review

Task: `di-freetier-ui`, artboards freetier-03 through freetier-14.

The existing sign-in shell, card, buttons, inputs, checkbox, theme colors and
public routes remain in use. Free-tier styling scopes the exported 320px card,
24px padding, 208px logo, 18px heading, 40px fields and 44px primary actions to
these pages. Native invalid events display inline field copy; native validation
and submission remain intact. The approval request has a sending label without
changing whether the button is enabled. No server exports, schemas, mail,
persisted data, authentication, feature flags, redirects or access gates change.

## Necessary differences from the artboards

- The route uses Arial from the existing exported fallback stack first. The local
  Linux system-ui face makes the 18px heading 293px wide versus about 250px in
  the export; Arial measures 248px and preserves the approved line wrapping.
- Grade level remains the existing required text field. Location remains
  required. There is no new grade option list or validation rule.
- Passwords still accept six characters (the existing shared schema). The hint
  accurately says six; the artboard's eight-character minimum is not introduced.
  Name length and password matching errors still use the existing action's
  generic alert; its response does not identify individual fields. The
  authorization checkbox retains its existing native required feedback.
- Existing event submission labels and event-specific subtitle remain. Invalid
  links and event-capacity/budget errors retain the existing form and guards.
  The artboards' terminal invalid/full screens would remove working controls.
  Closed event links retain their existing waitlist navigation.
- The existing page does not expose sign-in/back/forward navigation in several
  places shown in the artboards. No new navigation action is introduced:
  sign-in links, invite support link, administrator forwarding link, forwarding
  Back link and teacher “Look around” navigation remain absent. Existing status
  support links and the reminder action remain functional.
- Pending requests retain Resend reminder, its disabled/submitting behavior and
  all success/error responses. No classroom access is granted while waiting.
- Current loaders do not expose a request date, teacher email on the approval
  page, or the organization/teacher/recipient names on forwarding and invalid
  responses. Available names and email are shown; unsupported details stay
  generic. No loader fields or data queries are added for appearance.
- Manual review does not promise a two-day turnaround; the current backend has
  no such deadline. The budget response does not promise future email.
- Forwarding failures retain their existing terminal error screen. The
  artboard's retry form would change the current post-failure interaction.
- Current configuration diagnostics and application-unavailable branches retain
  their existing useful copy. The rejected and expired teacher status screens
  use the approved wording; trial-ended, paused and available states keep their
  existing controls and outcomes.
- The local tester-feedback control remains visible in browser evidence. It is
  an existing working control omitted from the artboards. Mobile source panels
  contain a broken exported logo image; the app retains its working YAWP logo.

## Evidence

Local evidence lives in
`/home/bryant/work/yawp/codex-loop/lanes/design-impl/shots/di-freetier-ui/`.
The sandbox permits writes within the lane; the shared
`/home/bryant/work/yawp/codex-loop/shots/` directory is outside its writable roots.

`before/` captures the branch base (`bb7f56fb`). `after/` captures the implementation. Each route
has desktop and 390px mobile captures. `compose.py` crops the supplied PNG panels
at their exported geometry without rescaling. `comparisons.json` maps source
panels, states, viewport width, before files and `-design`, `-impl` and
`-side-by-side` files. Variants supplied only at mobile width are centered at
unchanged scale on a desktop canvas and explicitly marked `derivedDesktop`.
Raw capture manifests distinguish actual local flows from intercepted rare
action responses. Password fields are masked; signed URLs are omitted.

Rare action fixtures cover rate limits, event capacity/budget, field errors,
onboarding sending/email-failure/not-ready/general error, approval confirmation
email failure/budget and forwarding email failure. The normal onboarding flow
covers waitlist/event outcomes, account creation, retries, reminders, replaced
links, forwarding limits, approval and terminal teacher states. Tests use a
disposable local database and captured mail only.

## Ship Review before approval

The reviewer must check:

- Off-flag sign-in and all existing controls and outcomes remain unchanged.
- Route loader/action/header source comparison is identical to the branch base (`bb7f56fb`).
- No delivery/BCC, provisioning, data, schema, flag or infrastructure changes.
- Targeted route tests and the supported web-app typecheck pass.
- Inspect the desktop/mobile side-by-side captures against the source PNG,
  exact text and computed styles, allowing only the differences listed above.
- No preview deployment, preview visit, production/demo writes or real email.

The remote main branch advanced during this cycle; comparison captures and
server-source checks use the pinned branch base. The driver handles rebasing.

The builder does not approve or merge this change. The driver rebases, runs
review/CI, takes the merge lock, and merges after approval.

## Local verification commands

The project CLI selected Bun 1.3.1 and Node 22.23.3. Writable cache recovery:

```sh
CI=1 XDG_CACHE_HOME=/tmp/di-cache BUN_TMPDIR=/tmp/di-bun \
  BUN_INSTALL_CACHE_DIR=/tmp/di-bun-clean-cache \
  ./bin/project bootstrap --fresh --json
CI=1 ./bin/project fixture verify local-dev --json
CI=1 NODE_OPTIONS=--max-old-space-size=3072 XDG_CACHE_HOME=/tmp/di-cache \
  BUN_TMPDIR=/tmp/di-bun ./bin/project test --profile typecheck --json
```

Browser command, from `services/web-app`, with the selected Bun directory on
PATH and the isolated `E2E_DATABASE_URL` supplied:

```sh
CI=1 XDG_CACHE_HOME=/tmp/di-cache BUN_TMPDIR=/tmp/di-bun \
  FREE_TIER_E2E_PORT=5211 \
  PW_EXECUTABLE_PATH=/home/bryant/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome \
  node node_modules/@playwright/test/cli.js test \
  --config=playwright.free-tier-style.config.ts --workers=1 --max-failures=1
```

The existing browser executable is selected through the supported
`PW_EXECUTABLE_PATH` override; no browser package or runtime version was added.
Run the ten affected route test files separately with the selected `bun test`
command to avoid cross-file module mocks. The isolated onboarding email-failure
fixture now stubs the feature gate, matching the other route unit fixtures.

Initial recovery attempts encountered incomplete dependency extraction, a
read-only Prisma cache, and the default 2GB Node heap limit. A repeated typecheck
alongside browser tests was interrupted for memory pressure; final checks run
sequentially. Existing LTI route-collision warnings are unchanged.


Final verification: 38 route regression tests pass in ten separate processes;
23 browser tests pass, with two hosted-demo checks skipped. The final visual
capture rerun passes four tests; the final project CLI typecheck passes with a
3GB heap. Evidence includes 86 comparisons covering all twelve supplied
artboards and 88 raw captures per phase (including the unchanged sign-in page).
Normal manual-review captures clear the earlier disposable mail-failure fixture;
mail failure is captured separately. All server loader/action/header exports
match the pinned base. No migration is included.

## PR #557 browser CI follow-up

CI run [38784725889, job 116595619970](https://github.com/The-Connell-School/yawp/actions/runs/38784725889/job/116595619970)
at reviewed head `400c1e9a` completed with 248 passes and two failures:
`free-tier.trial-status.spec.ts:39`, “expiry, rejection, budget pause, reading and
recovery”, at 1280px and 390px. Both failed at line 56 on the initial attempt
and both retries: the exact `Contact support` link locator found no element
within 5000ms. The failure artifact's accessibility snapshot shows an
`Email support` link with `href="mailto:support@yawp.school"` on the expected
trial-ended page. This is a task-related stale copy assertion, not an
infrastructure failure. Other model/sourcemap warnings did not fail tests.

The reviewed presentation intentionally uses “Email support”, as specified in
the freetier-10 text export and desktop/mobile comparison captures. The only
test correction changes that exact accessible-name expectation; the exact
mailto destination, terminal-state navigation restrictions, sign-out,
authorization, direct-data protection, budget denial and recovery checks remain.
No application source or presentation changed after the approved head, so the
existing 86 before/design/implementation/side-by-side comparisons remain valid.
All 344 referenced comparison files and the independent reviewer evidence were
checked locally before handoff. A reviewer must assess this test-only follow-up;
the earlier Ship Review approval applies to `400c1e9a`.

Local reproduction uses a temporary config that imports
`playwright.free-tier-style.config.ts`, selects only
`free-tier.trial-status.spec.ts`, and uses its existing local server setup.
The CLI-selected runtimes, isolated E2E database on the lane's Postgres instance,
empty mail credentials, and one browser worker are retained. The original
1280px test reproduces the exact line-56 failure before the assertion correction.
No full local suite or hosted preview is needed for this test-only change.

After the assertion correction, all seven trial-status browser tests pass with
one worker and no retries, including both viewport flows and the direct-data
authorization/gate cases. Fourteen fresh status captures and their manifest
are retained under `shots/di-freetier-ui/ci-followup/` in the lane. The earlier
38 builder route tests, 50 reviewer route/feature-gate/sign-in tests, 23 focused
browser passes and artboard comparisons still describe the unchanged app code.
The supported project CLI typecheck passes again with the existing 3GB heap
setting. The follow-up evidence's `diagnosis.json` records the exact commands,
failure details and manifest validation; `run-browser.py` and
`playwright-trial.config.ts` archive the temporary local runner/config.
