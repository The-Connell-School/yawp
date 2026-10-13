# PLAN: qa-waitlist-copy-fix-verify-rerun

## Scope
- Platform repo only, fresh worktree from `origin/main` on `codex/qa-waitlist-copy-fix-verify-rerun-20261013`.
- QA/e2e suite and repro evidence only. No product behavior changes, route changes, migrations, deploys, secret rotation, or email sends.
- Use demo/production wording and keep hosted demo mutation gated behind explicit disposable fixture environment variables.

## Implementation
1. Carry forward the durable free-tier demo Playwright suite harness from the approved QA branches because fresh `origin/main` does not yet contain the required seeded repro specs or runner.
2. Carry forward the focused waitlist event-link copy repro so this branch can produce current post-fix evidence from a fresh main base.
3. Preserve runner manifest/list contract checks, including failure coverage for missing required seeded specs.
4. Save screenshots and state evidence under `/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-waitlist-copy-fix-verify-rerun/`.

## Verification
- Run the suite manifest/list contract checks from `services/web-app`.
- Run the focused waitlist-copy repro with cached Chromium.
- Run the full durable free-tier demo suite if time and local environment allow; hosted demo remains a clean skip unless disposable hosted fixture env/auth is present.
- If the regression still reproduces, append `FAILURES.md` and file or record the matching free-tier-fixes P0b backlog item.
