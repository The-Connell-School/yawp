# PLAN: qa-suite-open-pr-clean-rerun

1. Reuse the open platform free-tier demo suite PR branch as the suite-under-review, but run it from a fresh worktree with no inherited `node_modules`.
2. Confirm the required seeded repro specs are present in the runner manifest/list output and that the missing-required-spec contract still fails when expected.
3. Run the focused Bun tests for the suite runner and failure-filing helper from the clean dependency state.
4. Run typecheck and the free-tier demo Playwright suite with cached Chromium where possible; hosted demo mutation must skip cleanly unless disposable demo fixture env is already configured.
5. Keep any changes limited to QA harness/docs/repro evidence. If the known waitlist copy regression reproduces, append fresh evidence without filing duplicate noisy variants or changing app behavior.
