# Independent Ship Review r1 — PR #887

**PR:** https://github.com/The-Connell-School/yawp/pull/887  
**Title:** ci: Night-1 LP suite hygiene + docs path filter + locked-preview sample points  
**Branch:** `cursor/ci-night1-lp-suite-hygiene-9209`  
**Base:** `main` @ `15fc135e7` (after #886)  
**Reviewed head SHA:** `d61a23ebfe585d7232c25dcf25eccc68b0b4cf84` (`d61a23ebf`)  
**GitHub `headRefOid` at review time:** `d61a23ebfe585d7232c25dcf25eccc68b0b4cf84` — **matches; freshness OK**

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-30  

**SHIP**

---

## Tip delta since review start (`f7d0ec927` → `d61a23ebf`)

| Issue @ `f7d0ec927` | Fix @ `d61a23ebf` | Verified |
| --- | --- | --- |
| **Prisma migrations** job failed on exact-head CI run 41045068602 | Follow-up commit `fix(ci): isolate locked-preview seed defaults + restore redact-deploy-logs contract text` — excludes `locked-preview-class-seed.defaults.test.ts` from bulk `find` free-tier loop; runs it in an isolated step; restores deployment-contract argv ordering (`check-ci-test-list` before `redact-deploy-logs.test.js`) | **Yes** — Prisma migrations **pass** on run 41045667350 @ `d61a23ebf`; `bun test ./scripts/deployment-contract.test.ts` → 102/102 pass locally |

Without the follow-up commit, verdict would have been **NO-SHIP** (exact-head CI red on migrations). **Re-read at `d61a23ebf` before merge.**

---

## Product intent vs implementation @ `d61a23ebf`

| Intent | Evidence | Result |
| --- | --- | --- |
| List 28 previously-unlisted Lesson Planner unit tests in CI | 28 new `app/**/lesson-planner*` paths in Feature flag unit tests loop; `scripts/ci/check-ci-test-list.ts` + guard in deployment-contract step | **Met** — `findUnlistedTests` returns `[]`; guard test in CI |
| `check-ci-test-list` guard + seed-parity + production-dark-by-default tests | New tests + `LESSON_PLANNER_REVIEW_FLAG_SETTINGS` export; both flag tests in LP loop | **Met** |
| `migration-integration` concurrency cancel-in-progress | `concurrency.cancel-in-progress: true` on PR workflow | **Met** |
| Locked-preview sample Class Starter → **10 points** for **new** samples only | `lockedPreviewSampleGradingDefaults()` on create path only (`if (exists) continue`); class_starter → 10, others → 100 | **Met** — no production row updates |
| Docs-only PRs skip browser E2E; required check stays green | `paths.e2e` output + docs-only detector; E2E jobs gate on `needs.paths.outputs.e2e` | **Met** — logic review; not exercised on this PR (code paths changed) |
| `e2e-web-app` aggregate depends on `e2e-locked-preview` | `needs` includes `e2e-locked-preview`; RESULTS loop fails on non-success/non-skipped | **Met** |
| No Teachers Lounge / trainings-link changes | PR diff vs `main`: 9 files, no lounge/trainings paths | **Met** |
| No product runtime change beyond sample seed defaults | Diff limited to CI/workflows, seed helper, flag export, tests | **Met** |

---

## Exact-head CI (required gate)

**Workflow:** https://github.com/The-Connell-School/yawp/actions/runs/41045667350  
**Run `headSha`:** `d61a23ebfe585d7232c25dcf25eccc68b0b4cf84` — **matches reviewed head**  
**Run conclusion:** `success`

| Check | Conclusion |
| --- | --- |
| Prisma migrations | pass |
| ʦ TypeScript | pass |
| 🧪 E2E smoke (shards 1–6) | pass |
| 🧪 E2E Tests (Playwright) aggregate | pass |
| 🧪 Free-tier locked preview browser | pass |
| 🔐 Sign-on, demo feedback, migration-integration, preview-deploy | pass |

**CI is green on exact head.**

---

## Reviewer-executed tests @ `d61a23ebf`

```text
bun test ./scripts/ci/check-ci-test-list.test.ts \
  ./services/web-app/app/domain/feature-flags/lesson-planner-seed-parity.test.ts \
  ./services/web-app/app/domain/feature-flags/production-dark-by-default.server.test.ts \
  ./services/web-app/app/domain/free-tier/locked-preview-class-seed.defaults.test.ts
→ 10 pass, 0 fail

bun scripts/ci/check-ci-test-list.ts → exit 0

bun test ./scripts/deployment-contract.test.ts → 102 pass, 0 fail
```

---

## Verdict

**SHIP**

**Reason:** Reviewed product head `d61a23ebf` matches GitHub; **exact-head CI is green** (run 41045667350); all Night-1 hygiene intents satisfied; follow-up commit correctly fixes the migrations failure seen @ `f7d0ec927`. **Do not merge from this review** — merge remains a separate human/product decision.
