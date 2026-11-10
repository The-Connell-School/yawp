# Independent Ship Review r2 — PR #850

**PR:** https://github.com/The-Connell-School/yawp/pull/850  
**Title:** PKG-08: Pending approval delta (remove Draft a Request, additional admin link)  
**Branch:** `cursor/pkg-08-pending-approval-delta-1bdf`  
**Base:** `main` (`ad939f9fb`)  
**Reviewer:** Independent ship review (Cloud Agent; not the original PR author)  
**Date:** 2026-11-05  

**SHIP** — merge to `main` for demo when this head's CI is green. No new production flag. Do not treat "do not merge to prod without greenlight" as a hold on `main`.

---

## What changed since r1

Rebased the two PKG-08 commits onto current `main` (clean rebase). The only new code is the onboarding action return for `email_failed`.

`submitAdminDetails` failures widen to `{ ok: false; reason: string }` and drop `error`. The action now returns an explicit `{ ok: false, reason: 'email_failed', error }` so `route.email-failure.test.tsx` typechecks and still asserts the delivery code. That was the sole `ʦ TypeScript` failure on the stale head (`route.email-failure.test.tsx` TS2769).

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| Remove Draft a Request mailto and in-card forward disclosure | `PendingDraftRequestLink` and `PendingForwardDisclosure` removed from the pending route | **Met** |
| Additional administrator link keeps prior pending approval open | `keepPreviousPending: true` on the onboarding additional-admin post; `forwardApprovalRequest` skips replacing the current pending row | **Met** |
| Approve link stays valid while its own approval row is `PENDING` | `supersededApproveLinkReason` returns null when the owning row is `PENDING`, and `superseded` when that row exists and is not pending | **Met** |
| Approved toast copy | `TEACHING_ACCESS_APPROVAL_TOAST_TITLE` is `You're approved!` | **Met** |

---

## Local checks

| Check | Result |
| --- | --- |
| `tsc` (web-app, after react-router typegen) | **pass** |
| `route.email-failure.test.tsx` | **pass** |
| `route.draft-request.test.tsx` | **pass** |
| `route.v2.test.tsx` | **pass** |
| `signed-link.server.test.ts` (no db) | **pass** |

Full Playwright stays on CI. Docker is not available in this environment, so the real-db approval integration test was not re-run here.

---

## Risk notes (non-blocking)

- Legacy pending (approval v2 off) also loses Draft a Request and does not gain the additional-administrator link. That is the original PKG-08 diff, not a rebase accident.
- `supersededApproveLinkReason` now treats any non-pending owning row as superseded before looking for a newer pending row. A link is tied to its own approval row.

---

## Merge recommendation

**Approve merge to `main` for demo** after exact-head CI is green. Lane is L2 behind the existing free-tier and approval v2 gates. No schema, billing, or production data change.
