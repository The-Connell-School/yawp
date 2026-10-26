# Independent Ship Review — Yawp! PR #823 (r1)

| Field | Value |
| --- | --- |
| **Target PR** | [#823](https://github.com/The-Connell-School/yawp/pull/823) — `fix(ci): silence feature-flag Prisma noise in TypeScript job (#8af)` |
| **Target branch** | `cursor/fix-ci-feature-flag-prisma-noise-9f8f` |
| **Reviewed head (GitHub `headRefOid`)** | `796399ef2a5545c82a7abf2d080174177fbd631e` |
| **Base** | `origin/main` @ `92ed159b9` (merge-base for diff) |
| **Review lane** | Independent Ship Review r1 (quality #8af) |
| **Reviewed at (UTC)** | 2026-10-26 |
| **Verdict** | **SHIP** |

## Intent

PR #823 adds test-only module mocks so the **ʦ TypeScript** CI job (no Postgres service) stops logging `feature_flag_read_failed` when isolated unit suites hit real feature-flag helpers against partial Prisma stubs. Claimed scope: no product or integration-test behavior change.

## Diff attestation (vs `origin/main`)

```
 services/web-app/app/routes/api.domain.lesson-planner/route.test.ts           | +17
 services/web-app/app/routes/app.writing-lessons.assigned.$classAssignmentId/route.generation-budget.test.ts | +4
 2 files changed, 21 insertions(+)
```

| Checklist item | Result |
| --- | --- |
| Test-only diff | **Pass** — only `*.test.ts` files |
| Product UI / Kevin / #608 / #437 / #459 / #484 / #723 | **Pass** — no matches in diff |
| Secrets / Terraform | **Pass** — none |
| Runtime feature-flag behavior | **Pass** — mocks live in unit test files only; `feature-flags.server.ts` and routes unchanged |
| DB / integration coverage | **Pass** — no edits to `*.integration.test.ts`, `*real-db*`, or migration SQL |

## Findings

### 1. `api.domain.lesson-planner/route.test.ts`

- Adds `getLessonPlannerReviewFlags` mock and registers `~/domain/feature-flags/feature-flags.server` alongside existing boundary stubs (`db.server`, `locked-preview.server`, etc.).
- `beforeEach` defaults all `LessonPlannerReviewFlags` fields to `false`, matching the shape returned by `getLessonPlannerReviewFlags()` in production.
- **Pattern:** Same approach as sibling lesson-planner route tests (e.g. stack/uploads suites) that mock `getLessonPlannerReviewFlags` instead of exercising `isFeatureFlagEnabled` → `prisma.setting` without a DB.
- **Behavior:** This file’s assertions do not depend on review flags being on; prior behavior already ran with failed flag reads (stderr noise) and implicit “off” semantics. The mock makes that explicit and removes CI log spam without widening production code paths.

### 2. `route.generation-budget.test.ts`

- Adds `locked-preview.server` stub with `assertOrganizationTeachingApproved` (no-op) and `organizationHasPendingFreeTierLessonPlannerMetering` → `false`.
- **Pattern:** Matches `ai-admission.server.test.ts`, which stubs the same module so real `reserveAiRequest` / admission logic can run without reaching feature-flag DB reads.
- **Behavior:** Preserves the file’s stated intent (“Keep … admission implementation real”) while stubbing only the free-tier approval boundary that would otherwise call `isFeatureFlagEnabled(FREE_TIER_FLAG)` against an incomplete Prisma client.

### 3. Residual risk (acceptable)

- Unit tests that mock flags no longer detect accidental regressions in flag *read plumbing* inside these two files. That coverage remains in Postgres-backed integration tests and dedicated feature-flag suites; this change does not remove or skip those jobs.

## CI note (reviewed head `796399ef2…`)

At review time on GitHub for `796399ef2a5545c82a7abf2d080174177fbd631e`:

| Check | Status |
| --- | --- |
| **ʦ TypeScript** | **SUCCESS** (primary signal for this fix) |
| **migration-integration** | **SUCCESS** |
| **Changed paths** / **Preview tooling** / **preview-policy** | **SUCCESS** |
| Several browser / E2E shards | Still **IN_PROGRESS** during the first review pass; not used as a merge block for this test-only change |

Verdict is **not** withheld for in-progress browser/E2E jobs; the TypeScript job that motivated the PR is green on the reviewed head.

## Verification performed by reviewer

- Confirmed GitHub `headRefOid` matches author-reported `796399ef2…`.
- Full `git diff origin/main...796399ef2a5545c82a7abf2d080174177fbd631e` read; compared mocks to `ai-admission.server.test.ts` and lesson-planner stack/uploads test patterns.
- Local `./bin/project doctor` reports environment gaps on this VM; reviewer did not re-run the full TypeScript job matrix locally. Relied on static diff review plus green **ʦ TypeScript** on the exact head above.

## Verdict

**SHIP** — Merge PR #823 when normal team process allows. This review does **not** merge #823.

---

*Docs-only review artifact. Independent Ship Review r1 for quality sweep #8af.*
