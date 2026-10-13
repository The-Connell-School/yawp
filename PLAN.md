# qa-regression-loop-post-fixes

## Scope

- Platform-only QA/e2e work in `services/web-app`.
- Reuse the durable free-tier demo runner and seeded repro specs from the recent QA suite branch.
- Re-run the local deterministic demo suite after seeded fixes, with hosted demo checks skipping cleanly when fixture/auth env is absent.
- Do not change product behavior, deploy, rotate secrets, or send email.

## Steps

1. Bring the durable free-tier demo suite context into this fresh `origin/main` branch without product behavior changes.
2. Confirm the manifest fails if required seeded repro specs are missing.
3. Run focused runner/filing helper tests.
4. Run `test:e2e:free-tier-demo` with `FREE_TIER_QA_SHOTS_DIR=/home/bryant/work/yawp/codex-loop/lanes/free-tier-qa/shots/qa-regression-loop-post-fixes`.
5. Preserve hosted demo skip evidence when hosted demo env is absent.
6. File any still-reproducing product regression to `FAILURES.md` and the fixes backlog P0b section.
