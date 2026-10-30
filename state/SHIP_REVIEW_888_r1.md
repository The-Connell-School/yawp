# Independent Ship Review r1 — PR #888

**PR:** https://github.com/The-Connell-School/yawp/pull/888  
**Title:** Fix Class Starter create booleans and demo Reporter cap-off metering  
**Branch:** `cursor/ua-intern-week2-bugs-0408`  
**Base:** `main`  
**Reviewed head SHA:** `2be3f011e90d32c271d21f29d9c67722c5cc5670` (`2be3f011e`)  
**GitHub `headRefOid` at review time:** `2be3f011e90d32c271d21f29d9c67722c5cc5670` — **matches; freshness OK**

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-30  

**SHIP**

---

## Product intent vs implementation @ `2be3f011e`

| Intent | Evidence | Result |
| --- | --- | --- |
| **Bug 1:** Class Starter create — Radix checkboxes must post booleans; failed save must not wipe in-progress edits | `BooleanFormValue` hidden inputs bound to React state; Radix `Checkbox` no longer carries `name`/`value`; regression test preserves prompt + tutor toggle after simulated failed create; first-open reset gated by `wasOpenRef` (sheet stays open on failure) | **Met** |
| **Bug 2:** Reporter/LP monthly metering separate from assignment tiles; cap at inclusive max (`100`) = unmetered; prod defaults (`2`/`5`) unchanged | `monthly-quota-cap.server.ts` uses `FREE_TIER_LIMIT_BOUNDS`; reporter + LP routes skip `beginMonthlyOperation` when cap is max; `inapp-usage.server.ts` skips usage read + keeps `reporter.remaining` at cap when unmetered; route/UI lock uses `remaining === 0` | **Met** |
| Demo may still need Internal `PUT` limits to 100 if DB never updated | Documented in PR body; code does not change stored defaults | **Noted — ops follow-up, not a code blocker** |
| No Thesis Statement “Next” changes | Diff vs `main`: 9 files only (assignment create sheet, free-tier cap helpers, reporter/LP API routes + tests) | **Met** |
| Do not touch free-tier PR #877 | No changes to #877 scope/files | **Met** |

---

## Exact-head CI

**Workflow (main CI):** https://github.com/The-Connell-School/yawp/actions/runs/41096581861  
**Workflow (preview):** https://github.com/The-Connell-School/yawp/actions/runs/41096582011  
**Run `headSha`:** `2be3f011e90d32c271d21f29d9c67722c5cc5670` — **matches reviewed head**  
**Status at review time:** **in progress** (TypeScript, E2E shards, Prisma migrations, browser checks pending)  
**Completed @ head:** `migration-integration` **success** (run 41096581643); Changed paths / Preview tooling / preview-policy **pass**

Exact-head CI was not fully green at review time. Product and targeted tests support **SHIP**; driver should confirm green exact-head CI before merge (repo norm).

---

## Reviewer-executed tests @ `2be3f011e`

```text
cd services/web-app && bun test \
  ./app/domain/free-tier/monthly-quota-cap.server.test.ts \
  ./app/domain/free-tier/inapp-usage.server.test.ts \
  ./app/routes/api.domain.reporter/route.test.ts \
  ./app/components/assignments/assignment-creation-sheet.test.ts
→ 84 pass, 0 fail, 1 skip (saved-assignments flag test)
```

(`inapp-usage` + `monthly-quota-cap` + assignment sheet + reporter route in isolation; reporter suite includes `max reporter cap skips monthly admission`.)

---

## Risks / review notes

1. **Demo DB defaults:** If demo still has `reporterMonthly: 2` / `lessonPlannerMonthly: 5`, interns will hit real caps until Internal `PUT /api/internal/v1/free-tier/limits` maxes both fields. Deploy alone does not flip stored limits.
2. **LP usage meter:** Unmetered LP skips monthly *admission* at cap 100; `lessonPlannerMonthly` display may still count plans toward 100 for nav meters. Reporter lock path is fully addressed for cap-off; LP lock behavior at sub-max caps unchanged (intended).
3. **Cap semantics:** `0` remains enforcing (blocks new usage); only `cap === FREE_TIER_LIMIT_BOUNDS[*][1]` is unmetered — aligns with Internal max operator workflow.

---

## Verdict

**SHIP**

No product blockers on head `2be3f011e`. Merge hold: wait for exact-head CI green unless driver accepts pending CI with this review (batch-friendly note in PR body).

**Do not merge from this review** — ship review only.
