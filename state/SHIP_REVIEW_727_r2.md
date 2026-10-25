# Independent Ship Review — PR #727 (round 2)

| Field | Value |
| --- | --- |
| PR | https://github.com/The-Connell-School/yawp/pull/727 |
| Branch | `cursor/weekend-qa-sweep-7b08` |
| **Reviewed head** | **`41b39659b59dc34414c10181d84c39fcb7d5e8db`** |
| Round | r2 (follows r1 **BLOCK** at `40bd8be0` for TS2339) |
| Reviewer mode | Read-only (no changes to PR branch; no merge) |
| Verdict | **SHIP** |

## Summary

Weekend QA #8 hardens the free-tier join-flow integration test for CI, fetches and masks remote deploy logs on preview deploy timeout, and bumps `@faker-js/faker` in `@app/prisma` devDependencies. After the `Prisma.AssignmentTypeWhereInput` type fix and merge of `main` (`61843f3d`, #728), the PR-specific risk items from r1 are resolved. Scope stays test/preview-tooling/dev-deps only.

## Review bar

### 1. TS2339 fix — correct and complete

**PASS.** Commit `f42f84b2` replaces the invalid indexed access on optional `Parameters<typeof prisma.assignmentType.findFirst>[0]['where']` with `Prisma.AssignmentTypeWhereInput` on the helper in `site-license-locked-tiles.join-flow.integration.test.ts`. No remaining `Parameters<typeof prisma.assignmentType…` usages in the repo at reviewed head. CI **ʦ TypeScript** green on `41b39659`.

### 2. Join-flow change — sound; no prod path / no `reset_data`

**PASS.**

- Test remains gated on `FREE_TIER_DB_TESTS === '1'`; production app code unchanged.
- Removes slow `importProdFidelityFixtures` / `loadProdFidelityBundle` fallback from the integration test only; replaces with minimal platform-catalog rows (thesis-driven essay, `daily_pages`, `act_writing`) plus existing bundle seed and AP History upsert — aligned with `siteLicenseLockedAssignmentTypesWhere` / locked-tile matchers (platform-owned + kind/title rules).
- `afterAll` still deletes only entities created in the test (`applicationIds`, `orgIds`, `userIds`); no `reset_data` or production seed scripts invoked.
- Prisma migrations job green (8m4s) — join-flow test exercised under CI load with **15s** timeout margin.

### 3. Deploy log timeout path — no secret leakage

**PASS.** On deploy poll timeout, `run-host-deploy-detached.sh` now calls `copy_deploy_log_local || true` before `emit_failure_log_tail`, mirroring the failure-after-exit path. Both paths run `mask_deploy_log` (SCP copy masked in place; tail piped through mask again). Static test `scripts/preview/deploy-log-secrets.test.js` asserts timeout branch invokes `copy_deploy_log_local` and documents redaction patterns; locally **4/4 pass** at review time.

### 4. Faker bump — dev-only

**PASS.** `@faker-js/faker` ^10.6.0 appears only in `packages/prisma/package.json` **devDependencies** and `bun.lock`; runtime import remains `packages/prisma/scripts/utils.ts` (seed/script tooling). No production service dependency graph change.

### 5. No Kevin PR touch; no production flag flips

**PASS.** Diff vs `main` at reviewed head: 5 files only (`join-flow.integration.test.ts`, `run-host-deploy-detached.sh`, `deploy-log-secrets.test.js`, `packages/prisma/package.json`, `bun.lock`). No feature-flag definitions, env defaults, or ops flag scripts modified. No files associated with Kevin PRs (#723 / #484 / #459) in the delta.

## CI at reviewed head (`41b39659`)

| Check | Result | Notes |
| --- | --- | --- |
| ʦ TypeScript | pass | r1 blocker cleared |
| Prisma migrations | pass | join-flow + migration suite |
| migration-integration | pass | |
| Preview tooling | pass | includes deploy-log tests |
| preview-deploy / preview-policy | pass | |
| E2E smoke (6 shards) | pass | |
| Sign-on browser flows | pass | |
| Free-tier locked preview browser | pass | |
| Demo feedback + preview access browser | **fail** | `dev-panel-class-simulation.spec.ts` — Clear simulated data button stayed disabled (60s); unrelated to PR file set; treated as known infra/flake per review instructions — **not a BLOCK** for this PR |
| E2E Tests (Playwright) aggregator | **fail** | Cascade from demo-feedback job failure |

## r1 → r2

| r1 issue | Resolution |
| --- | --- |
| TS2339 on optional `findFirst` args | Fixed in `f42f84b2`; TS green on merge head |
| (implicit) merge drift | `41b39659` merges `origin/main` (#728) |

## Recommendation

**SHIP** PR #727 at head **`41b39659b59dc34414c10181d84c39fcb7d5e8db`**.

Merge gate: treat demo-feedback failure as orthogonal unless reproduced on `main` without this branch; re-run or track class-simulation flake separately.
