# Independent Ship Review — PR #747 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/747  
**Branch:** `cursor/tiles-v2-locked-dashboard-8eb5` → `main`  
**Reviewed SHA:** `9df5a004d173fe27d487db0d95f10fb8aac37ae7`  
**Base (at review):** `origin/main` at fetch time (2026-10-25)  
**Remote HEAD at review time:** matched `9df5a004d173fe27d487db0d95f10fb8aac37ae7` (unchanged).

**Verdict:** SHIP

## Claim checklist (locked/pending + `free-tier`)

| Claim | Result |
| --- | --- |
| Assignment tiles: text-only + `SiteLicenseLockButton`, no art thumbnails | **Met** — `FreeAssignmentTiles` early return when `teachingLocked`; no `AssignmentTypeTileImage`; unit + e2e assert zero `img` under `free-assignment-tiles`. |
| No Create assignment CTA / preview-off copy on dashboard | **Met** — `PreviewAssignmentCreationControl` removed from locked path; header is title-only; tests/e2e assert no `preview-assignment-creation-disabled` or “Create assignment” on dashboard. |
| Hide `FreeAccountRail` checklist + `TeacherGradingAtAGlance` while locked | **Met** — `FreeAccountRail` returns `null` when `useTeachingAccess().locked`; route skips grading block and rail when `locked`; e2e asserts `free-account-checklist` and `teacher-grading-grid` count 0. |
| Lock tooltip a11y via `SiteLicenseLockButton` | **Met** — reuses existing component (`aria-label`, Radix tooltip desktop, mobile tooltip + Esc); covered by `site-license-lock-button.test.tsx` (not re-run in this review). |
| Usage card not added to sidebar | **Met** — no sidebar/usage-card files in diff. |
| Approved/unlimited dashboards unchanged | **Met** — unlocked branch retains artwork tiles, “New assignment”, plus icon, create sheet wiring; `teachingLocked` branches removed from unlocked disabled/create logic only. |
| Meter Direction A sidebar unchanged | **Met** — no lesson-planner/reporter meter or nav changes in diff. |

## Scope

Diff vs `main` is four files (+164 / −101), all aligned with tiles-v2 locked-dashboard alignment:

- `services/web-app/app/components/free-account-usage.tsx`
- `services/web-app/app/components/free-account-usage.locked-tiles.test.tsx`
- `services/web-app/app/routes/app._index/route.tsx`
- `services/web-app/e2e/tests/free-tier.locked-preview.spec.ts`

No feature-flag additions, migrations, Kevin/#608 surfaces, or unrelated product edits.

## Flag gating and regression surface

- Dashboard behavior is gated by existing **`freeUsage`** (free-tier in-app usage context) plus **`useTeachingAccess().locked`** (approval pending / locked shell). Paid teachers without `freeUsage` still use `AssignmentsAtAGlance` and are untouched.
- **`locked` during `loading`:** teacher home already returns `TeachingAccessDashboardSkeleton` when `freeUsage && loading`, so the new `!locked` grading/rail guards do not flash partial UI during load.
- **Approved path:** static tests for unlocked tiles (artwork, Unlimited meta, links, create control) still pass unchanged.
- **Redundant guard:** `FreeAccountRail` is suppressed both in the component and in `app._index`; harmless double-lock.

## Tests (local, reviewed SHA checked out)

At `9df5a004d173fe27d487db0d95f10fb8aac37ae7`:

- `bun test app/components/free-account-usage.locked-tiles.test.tsx app/components/free-account-usage.test.tsx` — **13 pass, 0 fail**
- `bun run typecheck` in `services/web-app` (`react-router typegen && tsc`) — **pass**

E2E not executed in this VM (no `./bin/project` fixture bootstrap for Playwright). GitHub on #747 at review time: **Free-tier locked preview browser** and **TypeScript** checks **pass**; several smoke shards were still pending.

## Risks (non-blocking)

- **Interactive nesting:** locked tiles remain `<Link>` wrappers with `SiteLicenseLockButton` (`<button>`) inside for navigation + lock tooltip. Mobile click uses `stopPropagation` on the button; acceptable for ship given existing `SiteLicenseLockButton` contract and passing locked-preview e2e, but worth watching if axe/interaction audits flag nested controls.

## Verdict rationale

Scope is tight and matches the PR claims. Gating stays on existing free-tier + teaching-access signals without widening to approved or site-license teachers. Unit tests and typecheck pass on the reviewed SHA; CI locked-preview coverage matches the behavioral delta. No merge performed on #747 as part of this review.
