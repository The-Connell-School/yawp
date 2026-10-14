# PLAN: qa-durable-suite-mainline-drift-check

- Refresh the platform free-tier demo QA suite on current `origin/main` with test/repro-only changes.
- Confirm the durable suite manifest/list evidence still represents duplicate Create link, Pending Approve 409, flag-vs-route, and waitlist-copy seeded repro families.
- Keep hosted demo mutation guarded: source the QA env for the guard run, but write skip artifacts unless disposable fixture env and explicit opt-ins are present.
- Run manifest/list output, runner/helper contract tests, and the deterministic local free-tier demo Playwright suite with capped workers.
- If a distinct new product failure appears, append lane `FAILURES.md` and prepend a matching fixes-lane `P0b` backlog item.
