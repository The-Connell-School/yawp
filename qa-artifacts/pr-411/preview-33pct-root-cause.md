# Preview `33% (F)` vs `5/20` (eaab8205)

## Evidence (independent review)

- API response on preview pr-411: `score: '33% (F)'`, `letterGrade: F`, `numericPercentage: 33`, UI panel also showed `7/20`.
- Earlier QA on same preview: `5/20` points-only (fixture or valid holistic path).

## Cause

1. **Holistic not selected:** Cristo Rey assignment types created on preview **before** `scoringMode: holistic_tier` was written into `gradingOutputSchemaJson` never got updated (`preview-seats.ts` only created new types). `resolveAssignmentTypeGradingConfig` then defaulted to weighted scoring.

2. **Invalid holistic fallback (fixed in `a7e3711d`):** When holistic was configured but model output lacked valid `overallTier` / `overallPoints` after retry, `route.ts` ~1536–1556 fell back to `buildDynamicGradeFields` + `applyStrictnessToGradeFields`, storing **percent + letter** (`33% (F)`) while category math could still surface inconsistent points in the UI.

## Fix on this branch

- `preview-seats.ts`: upsert `scoringMode: holistic_tier` on existing Cristo Rey types.
- `grade-essay-ai`: invalid holistic after retry → points-only `X/Y` with `aiMeta.holisticFallback.usedPointsFallback`, or 422 if no assignment total.
