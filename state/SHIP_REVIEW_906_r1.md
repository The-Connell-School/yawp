# Independent Ship Review r1 — PR #906

**PR:** https://github.com/The-Connell-School/yawp/pull/906  
**Title:** fix(prod): scope class creation uniqueness to school year  
**Branch:** `cursor/class-create-school-year-scope-024e`  
**Base:** `main`  
**Reviewed head SHA:** `84198400c9d324864c0353b12932516baf41d954` (`84198400c`)  
**GitHub `headRefOid` at review time:** `84198400c9d324864c0353b12932516baf41d954` — **matches; freshness OK**

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-04  

**SHIP**

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| Unblock teachers (e.g. Scranton Prep / Alex Placke) recreating the same section display name + period in a **new** school year | Idempotent migration drops legacy period/grade unique indexes; app-level `findTeacherClassIdentityConflict` scoped by `schoolYear` | **Met** |
| Same-year duplicate section for same teacher still fails with clear error | `TEACHER_CLASS_IDENTITY_CONFLICT_MESSAGE`; routes on my-classes + org classes; legacy P2002 mapped via `isLegacyClassPeriodUniqueViolation` | **Met** |
| Blank/unlabeled section creates (grade/period/title all null) remain allowed | Identity check skipped when all three unset; fixes free-tier integration + existing fixtures | **Met** |
| Production deploy applies migration so index drop lands | New migration `20261104160000_drop_legacy_class_period_uniqueness`; deploy workflow step `bun prisma:migrate-remote production` → `prisma migrate deploy` | **Met (post-merge deploy gate)** |

---

## Exact-head CI (required gate)

**Workflow (main CI):** https://github.com/The-Connell-School/yawp/actions/runs/41866072057  
**Workflow (migration-integration):** https://github.com/The-Connell-School/yawp/actions/runs/41866071857  
**Run `head_sha`:** `84198400c9d324864c0353b12932516baf41d954` — **matches reviewed head**  
**Run conclusion:** `success`

| Check | Result |
| --- | --- |
| Changed paths | pass |
| Preview tooling / preview-policy / preview-deploy | pass |
| migration-integration | pass |
| ʦ TypeScript | pass |
| Prisma migrations (incl. free-tier Postgres integration) | pass |
| E2E smoke shards 1–6, merge reports, Playwright | pass |
| Sign-on browser, demo feedback + preview access, free-tier locked preview | pass |

---

## Scope vs author claims (`origin/main...84198400c`)

**9 files** — one Prisma migration, `class-identity.server` + route wiring, unit/integration/e2e tests.

No feature flags (hotfix). Backward compatible: drops obsolete DB constraints; adds same-year guard only for named sections.

---

## Deploy / migrate verification (pre-merge read)

`.github/workflows/deploy.yml` runs **Apply production Prisma migrations** via `bun prisma:migrate-remote production` before Docker build/push. That script tunnels to production Postgres and runs **`prisma migrate deploy`**, which must apply `20261104160000_drop_legacy_class_period_uniqueness`.

---

## Merge recommendation

**Approve merge to `main`.** Merge authorized for prod hotfix; confirm deploy log shows migration applied.
