# qa-regression-suite-fresh-main

## Scope

- Platform-only QA branch from fresh `origin/main`.
- Bring forward the durable free-tier demo E2E harness and seeded repro specs only.
- Re-run the local deterministic demo suite with cached Playwright browser resolution, with hosted demo checks skipping cleanly when disposable fixture/auth env is absent.
- Do not change product behavior, deploy, rotate secrets, or send email.

## Steps

1. Reuse the existing free-tier demo suite runner/specs from prior QA work.
2. Run the runner manifest/list check and runner helper unit tests.
3. Run `bun run test:e2e:free-tier-demo` with `FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-regression-suite-fresh-main`.
4. Preserve hosted demo skip evidence when hosted demo env is absent.
5. File any new or changed regression to `FAILURES.md` and the fixes backlog P0b section.
6. Commit, push, open a platform PR, and write the required lane `state/BUILD_RESULT.md`.
