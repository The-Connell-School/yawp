### YAWP Release Gate Runbook

This runbook takes a pull request from “tests passing” to safe production, with rapid rollback if anything spikes.

High-level flow
- Write/adjust tests for each identified risk in this PR.
- Fix what fails locally; re-run the targeted tests until green.
- Run the gate script: `bun scripts/release-gate/gate` (or via the GitHub check “release-gate”).
- If SHIP: deploy behind a server-side per-school flag OFF by default.
- Enable the flag for one pilot org using the canary helpers.
- Watch errors and 5xx; auto-rollback (flag OFF) if thresholds are exceeded.

Step-by-step
1) Prepare targeted tests
- Unit/integration: add/extend tests that cover the risks your PR introduces (see CORE_RULES.md).
- Browser/E2E: where user-visible, add an acceptance test. Do not weaken existing assertions.
- Commit tests alongside source changes.

2) Run the release gate locally
- Requirements: git, curl, Node 22+ (Bun optional), env `GITHUB_TOKEN` if checking a remote PR body.
- Command: `bun scripts/release-gate/gate` (or `node scripts/release-gate/gate.mjs`).
- The script prints SHIP or BLOCK with concrete reasons. Fix BLOCKers and re-run.

3) Deploy behind a server-side flag
- Merge is manual by the repo owner. After merge to main, production deploy is automatic.
- Keep the new behavior OFF by default with a boolean on `Organization` (e.g. `writingPracticeEnabled`, `reporterEnabled`, etc.).

4) Enable for a single pilot org (canary)
- Set env: `DATABASE_URL`, the Postgres URL reachable from your shell.
- Enable: `bun scripts/release-gate/canary/enable-flag --org <ORG_ID> --flag <FLAG_NAME>`
- Disable: `bun scripts/release-gate/canary/disable-flag --org <ORG_ID> --flag <FLAG_NAME>`

5) Watch for spikes and auto-rollback
- Set env: `POSTHOG_PROJECT_ID=202514`, `POSTHOG_HOST=https://us.posthog.com`, `POSTHOG_API_KEY=<secret>`.
- Optional AWS 5xx watch (requires credentials): `AWS_REGION`, `APP_RUNNER_SERVICE_ARN`, standard AWS env keys.
- Run: `bun scripts/release-gate/canary/watch --minutes 10 --error-threshold 5 --server5xx-threshold 10 --org <ORG_ID> --flag <FLAG_NAME>`
- The watcher disables the flag automatically if thresholds are exceeded.

6) Widen rollout
- If stable for the pilot, enable the flag for a second org, then a small cohort. Continue monitoring.
- Announce full enablement only after sustained stability and no error/latency regressions.

Inputs and secrets
- Never hardcode secrets. Use env vars only.
- GitHub: `GITHUB_TOKEN` (automatically available in Actions).
- PostHog: `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID=202514`, `POSTHOG_HOST=https://us.posthog.com`.
- Database: `DATABASE_URL` for canary toggles.
- AWS (optional 5xx watch): standard CLI envs plus `APP_RUNNER_SERVICE_ARN`.

Gate exit codes
- 0: SHIP — all automated checks pass.
- nonzero: BLOCK — prints machine-parsable and human reasons.

What the gate checks mechanically
- CI for the head commit is green (and not pending).
- Branch is not behind `main`.
- Migration safety lint (no destructive `DROP/ALTER … DROP`, no `UPDATE` touching grade/score/rubric tables).
- Server-side flag checks present when new feature keywords appear in server routes/actions.
- Tests changed alongside source (at least one `*.test.*`/`*.spec.*` or E2E changed).
- PR body contains both “Risks:” and “Rollback:” sections.
- Optional verdict file `.release-gate/verdict.json` exists with `"blockers":0` and `"majors":0` (fails if present with nonzero).
- Prisma assignment-type integrity gate remains folded-in via the “Prisma migrations” CI job (must be green).

Roll back quickly
- Immediate: disable the org flag (`disable-flag` helper).
- If systemic: revert the merge commit (owner only), re-deploy automatically.
- See FAILURE_CHECKLIST.md for the full sequence.

See also
- CORE_RULES.md — the exact, testable rules this gate is enforcing.
- FAILURE_CHECKLIST.md — what to do when the gate blocks or production spikes.

