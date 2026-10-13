# qa-suite-open-pr-merge-readiness

- Start from fresh platform `origin/main` on `codex/qa-suite-open-pr-merge-readiness-20261013`.
- Reuse the existing durable free-tier demo Playwright suite work without changing product behavior.
- Verify the suite manifest includes all required seeded repro specs and that runner contract tests fail when a required spec is omitted.
- Confirm hosted demo paths skip cleanly when disposable fixture/auth env is absent and write skip evidence under the lane shots directory.
- Run the local deterministic free-tier demo suite with cached Chromium and record whether the known waitlist event-link copy regression still reproduces.
