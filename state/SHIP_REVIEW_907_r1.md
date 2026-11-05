# Independent Ship Review r1 — PR #907

**PR:** https://github.com/The-Connell-School/yawp/pull/907  
**Title:** Improve class sheet errors and live code availability  
**Branch:** `cursor/class-sheet-error-messages-578b`  
**Base:** `main`  
**Reviewed product/code SHA:** `1f7c800755fd904c5b2d3573f2347b968a4ff746` (`1f7c80075`)  
**Merge head SHA (exact-head CI gate):** `0c33434a82b1d4bc279dc1433b3d47b8000a5ee9` (`0c33434a8`) — includes Ship Review doc + CI fixes (mock typing, integration assertion)

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-11-04  

**SHIP**

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| Reused / conflicting class codes show explicit teacher-facing copy (not generic “Class could not be created”) | `classManageActionErrorFromCaught` + shared `CLASS_CODE_COLLISION_MESSAGE`; wired in my-classes + org classes create/edit | **Met** |
| Same failure modes on teacher My Classes and admin Organization Classes sheets | Both routes use shared mapper; both use `ClassCodeInput` + banner always renders `fetcher.data.error` | **Met** |
| Code conflicts visible on sheet (banner + field) | Removed banner suppression when `field === 'code'`; field still gets `aria-invalid` + alert | **Met** |
| Live availability while typing (check / X), debounced; auto-generated code not nagged | `ClassCodeInput` + `/api/class-code-availability`; `skipLiveAvailability` when create code equals generated | **Met** |
| No raw Prisma leakage; plan cap + legacy + identity paths preserved | Mapper order; `safeDomainErrorTextForClientResponse` for domain errors; legacy detection excludes `schoolYear` in field targets | **Met** |
| Backward compatible when class-code uniqueness flag off | Availability API returns `enforcementEnabled: false`; input UI unchanged (no generate/check path) | **Met** |

---

## Exact-head CI (required gate)

_CI URLs and conclusion recorded after terminal run on merge head — see merge step._

| Check | Result |
| --- | --- |
| _(pending terminal CI on PR head)_ | |

---

## Scope vs author claims (`origin/main...1f7c80075`)

**19 files** — shared error mapper, availability loader + server helper, `ClassCodeInput` UX, route catch simplification, unit/route tests. No migrations, no feature-flag changes.

---

## Risk notes (non-blocking)

- Live availability uses the same global class scan as `resolveClassCode` when the flag is on (acceptable consistency; not a new scalability pattern).
- `/api/class-code-availability` requires any signed-in user; exposes only boolean availability for a typed code (same information as a failed create).
- Collision copy says “at your school” while enforcement is org-wide when `classcode-unique` is everyone — acceptable teacher-facing simplification.

---

## Merge recommendation

**Approve merge to `main`.** Small UX fix; no deploy migration gate beyond normal production deploy.
