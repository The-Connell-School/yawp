# Independent Ship Review — PR #739 (r2)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/739 |
| **Branch under review** | `cursor/mobile-qa-fixes-0fdd` (read-only; not modified by this review) |
| **Reviewed head SHA** | `f0dc954aa092a75679f0f6f7e7180a3245cdd6b1` |
| **GitHub `headRefOid` at review time** | `f0dc954aa092a75679f0f6f7e7180a3245cdd6b1` (matches required head) |
| **Base** | `main` @ `eab6a20cc0763a0de524702874627e312dbc3c1e` (#737) |
| **Merge-base with `origin/main`** | `eab6a20cc0763a0de524702874627e312dbc3c1e` (includes stated base) |
| **Prior review** | `state/SHIP_REVIEW_739_r1.md` @ head `0db07cc625b88aee66397eba123825e96480a6dc` (docs PR #740) |
| **Design authority** | BRIEF + `design/mobile-390-bugs/` — artifact page **Mobile QA fixes** |
| **Verdict** | **SHIP** |

## Summary

r2 re-checks PR #739 after the author addressed both r1 blockers. The branch is rebased onto `main` @ `eab6a20cc…`, TypeScript passes locally and on CI, and the three BRIEF design intents (portrait bottom sheet, mobile top safe-area toasts, Reporter chrome titles) remain satisfied in code at `f0dc954aa…`. Reporter route body is unchanged aside from breadcrumb/meta for titles. No new user-facing “AI” copy in the diff.

## r1 blockers — status

| r1 blocker | r1 | r2 @ `f0dc954aa…` |
| --- | --- | --- |
| **SheetContent / `data-*` typing** | FAIL — `contentProps` on `DevPanelMobileBottomSheet` | **Cleared** — commit `f0dc954aa` sets `data-yawp-dev-panel`, `data-yawp-dev-panel-ready`, `id`, `role`, and `aria-modal` directly on `SheetContent` in `dev-panel-mobile-bottom-sheet.tsx`; shell passes only `open`, `onOpenChange`, and children |
| **Rebase onto current `main` (#737)** | FAIL — merge-base `9d9c7a381…` | **Cleared** — merge-base and PR base both `eab6a20cc0763a0de524702874627e312dbc3c1e`; zero commits on `main` not in branch |

## Checklist — Bug 1: Developer tools panel (portrait ~390)

| Requirement | Status | Notes |
| --- | --- | --- |
| Portrait: fixed bottom sheet ~85dvh, internal scroll, safe-area | **Met (code)** | `DevPanelMobileBottomSheet` + `max-h-[85dvh]`; scroll in shell body; `padding-bottom: env(safe-area-inset-bottom)` in CSS |
| Scrim, X, dismiss swipe >~30% / flick | **Met (code + unit tests)** | Radix overlay; X in header; `decideBottomSheetDismiss` tested |
| ~180ms motion; reduced motion fade | **Met (code)** | `duration-180` + mobile sheet keyframes; `yawp-dev-panel-reduced-motion` fade path |
| Landscape phone → side drawer; desktop docked panel + flyout | **Met (code)** | `showPhoneBottomSheet` portrait-only; `≥1024px` aside path unchanged |

## Checklist — Bug 2: Mobile toasts

| Requirement | Status | Notes |
| --- | --- | --- |
| Top inside safe area on mobile; not clipped at ~−328 | **Met (code + tests)** | `top-center` + `max(env(safe-area-inset-top), 1rem)`; CSS resets jump-toast `right`/`bottom` on `max-width: 639px` |
| Width `min(calc(100vw - 32px), 360px)`; above sheet (z-index) | **Met (code)** | `.yawp-mobile-sonner-toast`; toaster z-index 60 vs sheet 50 |
| **Desktop placement unchanged vs `main`** | **Met (code)** | Non-mobile: `position="bottom-right"` (same as `main`; BRIEF confirmed keep desktop as-is) |

## Checklist — Bug 3: Reporter title (chrome only)

| Requirement | Status | Notes |
| --- | --- | --- |
| `/app/reporter` → **Reporter** (mobile bar + tab) | **Met (code + tests)** | Prefix map + breadcrumb handle; mobile `document.title` via `appRouteDocumentTitle` |
| limit / locked / pending / settings titles | **Met (code + tests)** | Shared resolver; pending → **Approval status**; settings → **Settings** |
| No Reporter body/chart changes | **Met** | Diff on reporter route: `handle`, `meta`, imports only |

## Scope / policy scan

| Check | Result |
| --- | --- |
| User-facing **Yawp!** / no new “AI” in PR diff | OK |
| Feature flags | None added |
| Kevin / TeacherKev surfaces | Not touched |

## Residual manual smoke (unchanged from r1)

- [ ] iPhone ~390 portrait: dev tools open/close (drag >30%, flick, scrim, X, Esc); focus returns to beaker.
- [ ] With sheet open: success/error toasts at top safe area, no horizontal clip.
- [ ] `/app/reporter` and free-tier limit/locked: header **Reporter**; tab **Reporter \| Yawp!**.
- [ ] Phone landscape 844×390: right drawer panel.
- [ ] Desktop 1280: docked panel + flyout; toasts bottom-right.

## Test results (this review)

Environment: detached read-only checkout at `f0dc954aa092a75679f0f6f7e7180a3245cdd6b1`; Bun 1.4.4 at `/home/ubuntu/.bun/bin/bun`.

**PR-focused unit tests (pass):**

```text
cd services/web-app && bun test \
  app/dev-panel/dev-panel-bottom-sheet-dismiss.test.ts \
  app/dev-panel/dev-panel-mobile-styles.test.ts \
  app/utils/app-mobile-top-bar-title.test.ts \
  app/components/toaster.test.tsx
```

| Result | Detail |
| --- | --- |
| **Pass** | **13** tests, **0** failures (~1.3 s) |

**Typecheck:** `NODE_OPTIONS='--max-old-space-size=8192' bunx tsc --noEmit` — **pass** (no errors).

**CI snapshot @ `f0dc954aa…` (partial at review time):** Changed paths ✅; Migration integration ✅; **ʦ TypeScript ✅**; E2E smoke shards and sign-on flows still running (no failures observed on completed checks).

## Non-blocking notes (carry from r1)

- Sonner success `duration` (~4s), error persistence, and `visibleToasts={3}` still rely on library defaults; optional explicit props if design parity ever drifts.
- No new Playwright/mobile E2E for sheet drag or toast placement in this PR.

## Reviewer

Independent Ship Review r2 (Cursor Cloud Agent). This docs-only PR adds `state/SHIP_REVIEW_739_r2.md` only; does not modify `cursor/mobile-qa-fixes-0fdd` or merge #739.
