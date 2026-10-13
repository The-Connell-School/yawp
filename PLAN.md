# qa-suite-idle-maintenance-audit

1. Start from a clean platform worktree on `origin/main` using branch `codex/qa-suite-idle-maintenance-audit-20261013`.
2. Carry forward only the durable free-tier demo QA suite/repro surface needed for this maintenance audit: Playwright specs, suite runner, runner docs, and focused runner/failure-helper tests.
3. Add a runner contract check that suite-level hosted demo skip evidence is distinct from focused spec skip evidence.
4. Run the manifest/list path and runner contract tests, including missing-required-spec failure coverage.
5. Run typecheck with cache/temp paths redirected away from repo-local generated caches if needed.
6. Run the durable free-tier demo suite with cached Chromium where local env allows and save current artifacts under the lane shots directory.
7. If a distinct new regression appears, update `FAILURES.md` and prepend the matching P0b fixes backlog item; mention the existing LEAD join-link copy issue only as residual risk.
8. Commit and push the platform branch, open a PR, and write the required `state/BUILD_RESULT.md`.
