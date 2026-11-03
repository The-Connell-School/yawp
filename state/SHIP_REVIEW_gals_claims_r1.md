# Independent Ship Review r1 — GALS Claims Grading Assistant

**Branch:** `cursor/gals-claims-grading-assistant-2696`  
**Base:** `main`  
**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-02  

**SHIP** (pending exact-head CI green)

---

## Product intent vs implementation

| Intent (Brian 2026-11-02) | Evidence | Result |
| --- | --- | --- |
| Two bands only: Excellent / Needs Some Improvement | `GALS_CLAIMS_SCORE_LABELS` 0–1; rubric category `my_claim` | **Met** |
| Grade only sentence after `My claim:` | `extractGalsClaimSentence`, `buildGalsClaimsGradingContext`, `grade-essay-ai` routing | **Met** |
| Three-check Excellent rubric + NSI rules in GA instructions | `GALS_CLAIMS_PROMPT_CONFIG`, category description | **Met** |
| Student feedback rules (3rd–5th grade, no scores/learning needs, one fix) | `GALS_CLAIMS_FEEDBACK_INSTRUCTIONS` embedded in prompt | **Met** |
| Wire live Production Claims assignment type | Migration `20261102193000` sets `kind = gals_claims` on title `Claims` / `Claims Assignment`, clears legacy JSON so kind default applies | **Met** (verify prod title matches) |
| Mirror Class Starter pattern (kind registry + default rubric) | `assignment-type-rubric-config.ts` `gals-claims-default` | **Met** |

## Risk notes

- Migration matches assignment type **by title** only. If Brian renamed the type, apply `kind = gals_claims` manually in admin or adjust title list before deploy.
- Clearing `rubricJson` / `rubricId` on link intentionally drops any ad-hoc rubric on that row so the built-in GA wins.

## Verification run locally

- `bun test` on `gals-claims-rubric.test.ts`, `assignment-type-rubric-config.test.ts`, `new-assignment-defaults.test.ts` — **51 pass, 0 fail**
