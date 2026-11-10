# Independent Ship Review r1 — PR #909

**PR:** https://github.com/The-Connell-School/yawp/pull/909  
**Title:** fix(ci): allow SHIP_REVIEW artifacts on factory-l0 path  
**Branch:** `cursor/factory-l0-ship-review-exception-f793`  
**Base:** `main`  
**Reviewed product/code SHA:** `d21a6b405` (includes this artifact)  
**Merge head SHA (exact-head CI gate):** `d21a6b405`  

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-04  

**SHIP**

---

## Exact-head CI (required gate)

| Check | Result |
| --- | --- |
| CI workflow (Changed paths, Prisma migrations, ʦ TypeScript, E2E shards, browser jobs) | **pass** on run `41903391131` |
| Factory L0 smoke | **skipped** (expected — PR touches `.github/` and `scripts/`) |
| Preview deploy | **pass** on run `41903388711` |

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
