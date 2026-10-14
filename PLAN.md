# PLAN: qa-suite-post-closure-mainline-health

- Refresh the platform free-tier demo QA suite on current `origin/main` with test/repro-only changes.
- Restore the durable suite runner, manifest docs, hosted-demo skip evidence, and missing seeded repro specs while preserving current waitlist-copy behavior checks.
- Keep hosted demo mutation guarded: write skip artifacts unless disposable fixture env and explicit opt-ins are present.
- Run manifest/list output, runner/helper contract tests, typecheck, and the deterministic local free-tier demo Playwright suite with capped workers.
- If a distinct product failure appears, append lane `FAILURES.md` and prepend a matching fixes-lane `P0b` backlog item.
