# Independent Ship Review — PR #872 (r6)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main`  
**Reviewed head SHA:** `04117e98dbaf266914846dced8110c8f1da2943f`  
**Prior ship head:** `26ca97f6e301bc7a8382b9936ce0ad6f26eb9b23` (r5)  
**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-27  

**SHIP**

## Delta since r5

`git diff 26ca97f6e301bc7a8382b9936ce0ad6f26eb9b23..04117e98dbaf266914846dced8110c8f1da2943f` touches **one file only** (+8 / −1):

| File | Change |
|------|--------|
| `services/web-app/app/utils/internal-rubrics-http.server.test.ts` | Align validate-response assertions with `parseScoringScale`: omitted-scale default is `{ type, minScore, maxScore }` only; `toMatchObject` + explicit `expect('step' in …).toBe(false)` when input scale is `undefined`. |

No product, migration, or feature-flag changes in this delta. Matches the author claim for r6.

## Product behavior (unchanged since r5; re-verified at this head)

- **Legacy Platform assignment-type admin:** Restored barebones rubric editor on admin routes; `requireAdmin` on loader/action paths; no new feature flag in the PR diff vs `main`.
- **`_lastAdminEdit`:** Provenance stamped on grading-related writes via `assignment-type-admin-provenance.server.ts` when admin edit metadata is supplied.
- **No Prompt primary path:** Route/tests continue to treat Prompt as non-primary on the legacy editor (covered by prior r1–r5 scope).
- **`parseScoringScale`:** Does not inject `step` when absent from stored JSON; only copies `step` when present (`assignment-type-rubric.shared.ts` at head).
- **Basics-only / unchanged admin POSTs:** `parseAdminUpdateGradingConfig` returns `undefined` when semantic rubric/scale/prompt/output unchanged, preserving existing `scoringScaleJson` (including scales stored without `step`); posts that only add default `step: 1` do not force a write (`assignment-type-admin-writes.server.test.ts`).

**Migrations / flags:** `git diff origin/main..04117e98dbaf266914846dced8110c8f1da2943f` includes no `prisma/migrations` or new PKG-14 feature toggles.

## Tests expecting injected `step: 1` on omitted-scale defaults

Grep at reviewed head for omitted-scale / omitting-scale assertions:

- `rubric-promotion.test.ts` — r5 aligned: `toMatchObject` without `step`; asserts `'step' in result.schema.scoringScale` is false.
- `internal-rubrics-http.server.test.ts` — r6 aligned: same contract for validate HTTP path.

**No remaining tests** at this head assert an injected `step: 1` on omitted-scale parse defaults. Other `step: 1` occurrences in the repo are explicit fixture JSON (stored scales, semantic-equality POST bodies, e2e seeds) and are consistent with preservation behavior, not omitted-default injection.

## Local verification (reviewed head)

Checked out `04117e98dbaf266914846dced8110c8f1da2943f` and ran:

```text
bun test app/utils/internal-rubrics-http.server.test.ts
bun test app/domain/rubrics/rubric-promotion.test.ts
bun test app/domain/assignment-types/assignment-type-admin-writes.server.test.ts
→ 29 pass, 0 fail
```

## CI (single observation; not polled)

At review time on commit `04117e98dbaf266914846dced8110c8f1da2943f`:

- **PASS:** `preview-policy`
- **PENDING:** `migration-integration`, `preview-deploy`
- **SKIPPED:** preview cleanup/destroy jobs

No failed required checks observed. r6 is test-only and directly addresses the prior TypeScript/unit mismatch called out after r5; pending full matrix is acceptable for this review.

## Verdict

**SHIP** @ `04117e98dbaf266914846dced8110c8f1da2943f` — r6 delta is the expected single-file test alignment; product/admin behavior unchanged and consistent with r1–r5 ship bar. No blockers identified. This review does not merge.

**Blockers:** none
