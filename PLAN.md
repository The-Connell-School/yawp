# qa-suite-open-pr-merge-readiness-refresh

1. Start from a clean platform worktree on `origin/main` using branch `codex/qa-suite-open-pr-merge-readiness-refresh-20261013`.
2. Carry forward only the durable free-tier demo QA suite/repro surface from the prior merge-readiness branch: Playwright specs, suite runner, runner docs, and focused runner/failure-helper tests.
3. Run the manifest/list and runner contract tests, including missing-required-spec failure coverage.
4. Run typecheck with cache/temp paths redirected away from repo-local generated caches if needed.
5. Run the durable free-tier demo suite with cached Chromium and save current artifacts under the lane shots directory.
6. If the known waitlist event-link copy regression reproduces, refresh `FAILURES.md` and prepend the matching P0b fixes backlog item.
7. Update lane backlog/status, commit and push the platform branch, open a PR, and write the required `state/BUILD_RESULT.md`.
