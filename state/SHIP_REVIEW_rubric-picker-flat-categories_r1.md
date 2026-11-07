# Independent Ship Review r1 — PR #922

**PR:** https://github.com/The-Connell-School/yawp/pull/922  
**Title:** Fix admin rubric picker omitting flat category JSON (builder exports)  
**Branch:** `cursor/rubric-picker-flat-categories-d591`  
**Base:** `main`  
**Reviewed product/code SHA:** `7be4867cba9867866b2cd6e14486ae7d2fc7f150` (`7be4867c`)  

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-07  

**SHIP**

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| Library rubrics saved with top-level `categories` (no `rubric` wrapper) appear in the assignment-type admin rubric dropdown | `listLiveRubricsForAdminPicker` uses `rubricCategoriesArrayFromSchemaJson` before pushing options; regression test with `looking-back-looking-forward` flat `schemaJson` | **Met** |
| Selection / resolution does not reject flat published shapes | `resolveAdminRubricPickerSelection` category guard uses same helper; `libraryContentUsableForPicker` aligned | **Met** |
| Catalog summaries and edit copy respect flat shapes | `RubricCatalog` `toEditable`, `readOnlyReason`, `categoryCount` use shared helper | **Met** |
| Category extraction matches parser rules (nested preferred) | `rubricCategoriesArrayFromSchemaJson` + unit test preferring `rubric.categories` over top-level | **Met** |

---

## Exact-head CI (required gate)

Checked once on PR head `7be4867c` (run `42269117313` family): Changed paths, Prisma migrations, ʦ TypeScript, E2E smoke (all shards), merge smoke report, browser jobs, preview-deploy — **pass**. Factory L0 smoke **skipped** (expected for product diff).

---

## Scope vs author claims

**5 files** under `services/web-app/app/domain/rubrics/` — new exported helper in `rubric-schema.ts`, deduped inline `categoriesOf` in picker + catalog, one picker integration test, schema unit tests. No migrations, flags, or UI components.

**Independent diff review:** Prior `categoriesOf` helpers only read `content.rubric.categories`, so rows that already passed `parseRubricSchema` (which accepts `rubricSource = raw.rubric ?? raw`) were filtered out in `listLiveRubricsForAdminPicker` / resolution. The fix centralizes the same shape rules in `rubricCategoriesArrayFromSchemaJson`.

**Independent verification:** On checkout of `7be4867c`, `./bin/project test --profile assignment-rubric-unit --json` — **passed** (140 tests incl. new flat-picker and helper precedence cases).

---

## Risk notes (non-blocking)

- `prod-shaped-admin-picker-count.ts` still embeds a local `categoriesOf` that only reads nested categories; fixture-based prod picker count tests do not use flat shapes today. Consider aligning that helper in a follow-up if prod fixtures gain flat library JSON.
- No new E2E for the dropdown; coverage is domain/unit level. Acceptable for a server-side filter bug with targeted regression test.

---

## Merge recommendation

**Approve merge to `main`.** Narrow backward-compatible fix for a prod-reported gap (saved library rubric invisible in picker); full CI green on reviewed head.
