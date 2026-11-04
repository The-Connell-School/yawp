# Independent Ship Review r1 — PR #909

**PR:** https://github.com/The-Connell-School/yawp/pull/909  
**Title:** fix(ci): allow SHIP_REVIEW artifacts on factory-l0 path  
**Branch:** `cursor/factory-l0-ship-review-exception-f793`  
**Base:** `main`  
**Reviewed product/code SHA:** `5137a280c7f6ccdc99276a92973833accc69c87d` (`5137a280c`)  

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-04  

**SHIP**

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| L0 fast path no longer blocked solely by committed Ship Review markdown | `!state/SHIP_REVIEW_*.md` negation in `ci.yml`; TS regex `^state/SHIP_REVIEW_[^/]+\.md$` | **Met** |
| Other `state/**` remains fail-closed | Tests: `state/other.md`, nested ship review, `.md.bak`; glob still lists `state/**` | **Met** |
| Migrations still block L0 when present | `evaluateFactoryL0EligibilityFromChangedFiles` test with migration + ship review | **Met** |
| TS helper and workflow filters stay aligned | `FACTORY_L0_STATE_SHIP_REVIEW_ALLOW_GLOB`; FACTORY-L0.md documents exception | **Met** |

---

## Scope vs author claims

**4 files** — `factory-l0-eligibility.ts` (+ path helpers), expanded unit tests, one paths-filter line, FACTORY-L0.md. No runtime app changes, no install-step changes.

---

## Risk notes (non-blocking)

- Paths-filter negation depends on dorny/paths-filter v3 glob semantics; pattern is narrow (top-level only).
- This PR cannot use `factory-l0` (touches `.github/` and `scripts/`); full CI is expected.

---

## Merge recommendation

**Approve merge to `main`.** CI-only eligibility fix; unblocks L0 copy PRs that include required Ship Review artifacts.
