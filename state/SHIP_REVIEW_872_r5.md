# Independent Ship Review — PR #872 (r5)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main`  
**Reviewed head SHA:** `26ca97f6e301bc7a8382b9936ce0ad6f26eb9b23`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Delta since r4 (`2378ef6ccef03e5d7ce43b65e6434545ee9216d1`)

Diff `2378ef6c..26ca97f6e301bc7a8382b9936ce0ad6f26eb9b23` is **one commit, one file**:

| File | Change |
|------|--------|
| `services/web-app/app/domain/rubrics/rubric-promotion.test.ts` | Default-scale expectation: `toMatchObject({ type, minScore, maxScore })` and assert `'step' not in scoringScale` instead of requiring `step: 1` |

No product code changed since r4. Matches author claim and r4 follow-up (TypeScript job failure on stale `step: 1` expectation after intentional `parseScoringScale` shape).

## Full PR scope (unchanged since prior SHIP reviews)

`main...26ca97f6e` — 18 files, legacy Platform assignment-type admin + barebones rubric editor; admin routes use `requireAdmin`; `_lastAdminEdit` provenance on admin writes; E2E/list/creator alignment. **No** Prisma migrations or schema diff. **No** feature-flag wiring in the PR diff.

## parseScoringScale & admin write preservation

At reviewed head, `parseScoringScale` applies type/min/max defaults and only sets `step` when present in stored JSON (`normalizeScoreStep`); it does **not** inject `step: 1` on null/omitted input. That matches the updated promotion test and prior r4 product intent.

`parseAdminUpdateGradingConfig` still:

- Returns `undefined` when posted config is semantically unchanged (no spurious `gradingAssistantVersion` bump).
- Treats posted `step: 1` as equal to stored scale without `step` via `scoringScaleSemanticallyEqual` + `normalizeScoreStep`, preserving bare `scoringScaleJson` on basics-only saves.

Unit coverage at head (local):

```text
bun test rubric-promotion.test.ts assignment-type-admin-writes.server.test.ts → 22 pass, 0 fail
```

## Access control

Loaders/actions on `app.admin.assignment-types.$id`, `app.admin.assignment-types.new`, and related admin assignment routes call `requireAdmin(request)` at reviewed head (code review on detached head `26ca97f6e`).

## CI (single check, no polling)

At review time: **no failed checks**; several jobs **pending** (Changed paths, migration-integration, preview-deploy). preview-policy **pass**. Prior r4 failure on TypeScript/`rubric-promotion.test.ts` is addressed by the test-only delta above; pending TypeScript is acceptable for this review.

## Verdict

**SHIP** on `26ca97f6e301bc7a8382b9936ce0ad6f26eb9b23` — delta since r4 is the intentional unit-test alignment only; parse/preservation/admin-gating behavior from r4 remains sound; no migrations or flags. This review does not merge.
