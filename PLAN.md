# PLAN: qa-waitlist-copy-fix-verify-rerun

## Scope
- Platform repo only, reusing open PR #492 branch `codex/qa-waitlist-copy-fix-verify-rerun-20261013`.
- QA/e2e suite and repro evidence only. No product behavior changes, route changes, migrations, deploys, secret rotation, or email sends.
- Use demo/production wording and keep hosted demo mutation gated behind explicit disposable fixture environment variables.

## Implementation
1. Confirm the branch still contains the durable free-tier demo Playwright suite harness, required seeded repro specs, and focused waitlist event-link copy repro.
2. Refresh focused repro screenshots, application-state JSON, hosted-demo skip artifact, suite manifest, and suite summary.
3. Preserve runner manifest/list contract checks, including failure coverage for missing required seeded specs.
4. Save evidence under `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-waitlist-copy-fix-verify-rerun/`.

## Verification
- Run the suite manifest/list contract checks from `services/web-app`.
- Run the focused runner/failure-helper contract tests.
- Run the focused waitlist-copy repro with cached Chromium.
- Run the full durable free-tier demo suite if time and local environment allow; hosted demo remains a clean skip unless disposable hosted fixture env/auth is present.
- If the regression still reproduces with the same shape, refresh `FAILURES.md` only when useful for timestamped evidence and do not add duplicate fixes backlog items.
