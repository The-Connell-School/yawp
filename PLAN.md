# PLAN: qa-suite-contract-audit

## Scope
- Platform repo only, fresh worktree from `origin/main` on `codex/qa-suite-contract-audit-20261013`.
- QA/e2e harness and repro coverage only. No product behavior changes, migrations, deploys, secret rotation, or email sends.
- Use demo wording and keep hosted demo mutation gated behind explicit disposable fixture env/auth.

## Implementation
1. Restore the durable free-tier demo E2E runner from prior QA suite branches into this fresh branch: package script, Playwright config, runner, failure helper, suite docs, and seeded repro specs.
2. Audit and harden the suite contract so required seeded repro specs are declared in one manifest/list and a missing required spec makes the runner/focused contract tests fail.
3. Preserve cached Chromium/Chrome recovery via `PLAYWRIGHT_BROWSERS_PATH=/home/bryant/.cache/ms-playwright` and existing executable discovery.
4. Preserve hosted demo skip artifacts when disposable hosted fixture env/auth is absent.

## Verification
- In `services/web-app`, run runner/manifest contract tests, including the missing-required-spec path.
- Run `bun run test:e2e:free-tier-demo` with `FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-suite-contract-audit` and cached browser env.
- Run typecheck only if QA code changes require it and document any blocker.
- Capture manifest/list, skip, summary, and failure artifacts under the lane shots directory.
