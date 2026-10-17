# Free-Tier Demo E2E Suite

For this `qa-durable-suite-post-closure-refresh` run, use:

```bash
cd services/web-app
PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright \
FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-durable-suite-post-closure-refresh \
bun run test:e2e:free-tier-demo
```

The command resolves the free-tier specs present in the checkout, writes a `suite-manifest.txt` under the screenshot directory, prepares the deterministic E2E database, and then runs the specs through `playwright.free-tier-demo.config.ts` with `--project=chromium`. The dedicated config uses its own app port and does not reuse an existing local app server.

The runner honors `PW_EXECUTABLE_PATH` when set. Otherwise it scans `PLAYWRIGHT_BROWSERS_PATH` for cached Chromium/Chrome executables, prefers the newest full Chrome cache entry such as `chromium-1248/chrome-linux64/chrome`, and passes that path to Playwright. This lets the lane run even when Playwright's default headless-shell revision is missing. If no executable is available, the runner exits before database prep with the path to check and the install/env override to use.

To inspect what will run without starting Playwright:

```bash
bun run scripts/run-free-tier-demo-e2e.ts --list
```

## Coverage Manifest

The default runner executes merged free-tier demo coverage for:

- `e2e/tests/free-tier.onboarding.spec.ts`: waitlist, release join, approval, local free-tier onboarding
- `e2e/tests/free-tier.feature-flag.spec.ts`: flag-vs-route free-tier route/flag availability
- `e2e/tests/free-tier.bundle-quotas.spec.ts`: free classroom caps and visible quota counters

The manifest also references related merged smoke/screenshot coverage without running it as part of the default demo suite:

- `e2e/tests/auth.free-tier-handle-join.spec.ts`: teacher handle join path
- `e2e/tests/auth.free-tier-handle-join.qa-screens.spec.ts`: teacher handle join screenshot evidence
- `e2e/tests/auth.signup.student.spec.ts`: student sign-up baseline

It also references the seeded free-tier QA repro specs as they land:

- `e2e/tests/free-tier.event-auto-admit.spec.ts`
- `e2e/tests/free-tier.event-waitlist.spec.ts`: waitlist-copy event-link confirmation behavior
- `e2e/tests/free-tier.disabled-expired.spec.ts`
- `e2e/tests/free-tier.repeat-signup.spec.ts`
- `e2e/tests/free-tier.caps-limits.spec.ts`
- `e2e/tests/auth.free-tier-student-signin.spec.ts`

Those specs keep their local deterministic stand-ins and hosted demo skip checks. The suite runner does not replace those checks; it only groups the runnable files and records missing hosted demo access once at the suite level.

The manifest also records the seeded repro family inventory. `qa-approve-409` is the Pending Approve 409 internal admin repro and `qa-dup-create-link` is the duplicate Create link internal admin repro; both are recorded as external to the platform suite. `qa-flag-vs-route` and `qa-event-waitlist-copy-regression` are covered by platform specs.

## Hosted Demo Skips

Hosted demo checks require disposable demo access inputs and explicit mutation opt-ins. When any hosted access input or mutation opt-in is absent, the runner writes `suite-hosted-demo-skip.txt` under the screenshot directory and still runs the local deterministic specs. Focused specs write their own named skip artifacts, such as `hosted-demo-repeat-signup-skip.txt`, so suite-level evidence does not overwrite focused evidence.

```bash
DEMO_FREE_TIER_BASE_URL
DEMO_FREE_TIER_EVENT_TOKEN
DEMO_FREE_TIER_JOIN_TOKEN
QA_DEMO_BASE_URL
QA_DEMO_STUDENT_JOIN_TOKEN_ONE
QA_DEMO_STUDENT_JOIN_TOKEN_TWO
DEMO_FREE_TIER_REPEAT_EMAIL
DEMO_FREE_TIER_REPEAT_ALLOW_SUBMIT=true
QA_DEMO_STUDENT_JOIN_ALLOW_SUBMIT=true
DEMO_FREE_TIER_DISPOSABLE_OK=1
```

Without the disposable fixture values and explicit mutation opt-ins, the suite records skip artifacts before any hosted `/free?t=` navigation, join submission, or demo mutation attempt.

## Filing Failures

If this suite finds a regression, append the lane failure note and attempt to file the fixes backlog item with:

```bash
cd services/web-app
bun run scripts/file-free-tier-qa-failure.ts \
  --id=ft-qa-durable-suite-post-closure-refresh \
  --slug=qa-durable-suite-post-closure-refresh \
  --title="Free-tier demo E2E suite regression" \
  --evidence="/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-durable-suite-post-closure-refresh" \
  --severity=major \
  --dedupe-key="LEAD waitlist application" \
  --repro="Run \`bun run test:e2e:free-tier-demo\`." \
  --expected="The free-tier demo E2E suite passes without regressions." \
  --actual="The suite found a regression; see the Playwright output and screenshots."
```

The helper appends a dated, template-compliant section to `FAILURES.md` with `severity`, `env`, `repro`, `expected`, `actual`, `screenshots`, and `filed_to_fixes`. If the fixes backlog is outside the writable sandbox, the helper prints the exact `P0b` item to add manually and records `filed_to_fixes: no` in the failure entry.
For known failure families, pass a stable `--dedupe-key` from the existing evidence so reruns do not append duplicate `FAILURES.md` sections or duplicate fixes-lane `P0b` snippets.
