# Independent Ship Review — PR #739 (r1)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/739 |
| **Branch under review** | `cursor/mobile-qa-fixes-0fdd` (read-only; not modified by this review) |
| **Reviewed head SHA** | `0db07cc625b88aee66397eba123825e96480a6dc` |
| **Requested base** | `main` @ `eab6a20cc0763a0de524702874627e312dbc3c1e` |
| **GitHub `headRefOid` at review time** | `0db07cc625b88aee66397eba123825e96480a6dc` (matches required head) |
| **Merge-base with `origin/main`** | `9d9c7a3812eda0bc74e8aae9e0c9f3c6587bc199` (one commit behind stated base `eab6a20cc…`) |
| **Design authority** | `design/mobile-390-bugs/` canvases + BRIEF; artifact page **Mobile QA fixes** |
| **Verdict** | **BLOCK** |

## Summary

PR #739 targets three mobile QA fixes (dev panel bottom sheet, top safe-area toasts, Reporter mobile/document titles). Code review against the design brief shows **strong alignment** on layout and routing behavior, but the head is **not rebased** onto the declared base and **CI TypeScript fails** on a change introduced in this PR. Either issue is sufficient to block ship under review rules.

## Checklist — Bug 1: Developer tools panel (portrait ~390)

| Requirement | Status | Notes |
| --- | --- | --- |
| Portrait: `position: fixed` bottom sheet ~85dvh, internal scroll, safe-area | **Met (code)** | `DevPanelMobileBottomSheet` + `SheetContent` `side="bottom"`, `max-h-[85dvh]`, scroll in shell body; `padding-bottom: env(safe-area-inset-bottom)` in CSS |
| Scrim, X, dismiss swipe >~30% / flick, snap-back otherwise | **Met (code + unit tests)** | Radix overlay; X in header; `decideBottomSheetDismiss` tested |
| ~180ms close; focus returns to beaker | **Met (code)** | `closePanel` 180ms + `.yawp-dev-panel-beaker button` focus; mobile sheet CSS 180ms |
| Reduced motion: fade not slide | **Met (code)** | `yawp-dev-panel-reduced-motion` + mobile sheet fade animation |
| Landscape phone → side drawer | **Met (code)** | `showPhoneBottomSheet` only for portrait; landscape uses `Sheet` `side="right"` |
| Desktop → anchored right panel + flyout unchanged | **Met (code)** | `yawp-dev-panel-docked` aside path unchanged for `≥1024px` |
| Esc closes panel | **Met (code)** | Radix dialog + `onOpenChange` → `closePanel` (sub-sheet Esc handled separately) |

**Gap:** No Playwright/mobile E2E in this PR; drag/scrim/focus not exercised in CI from this review environment (Docker unavailable).

## Checklist — Bug 2: Mobile toasts (clip at x≈−328)

| Requirement | Status | Notes |
| --- | --- | --- |
| Top of viewport inside safe area on mobile | **Met (code)** | `position="top-center"` + `top: max(env(safe-area-inset-top), 1rem)`; CSS overrides jump toasts on `max-width: 639px` |
| Width `calc(100vw - 32px)`, max 360px | **Met (code)** | `.yawp-mobile-sonner-toast` + jump-toast mobile rules |
| Above sheet/scrim (z-index) | **Met (code)** | Toaster `z-index: 60` vs sheet `z-index: 50` |
| Body portal | **Met (code)** | Sonner portal (unchanged pattern) |
| Desktop placement unchanged vs `main` | **Met (code)** | Desktop remains `bottom-right` (same as `main`; brief confirmed keep desktop as-is) |
| Success ~4s auto-dismiss; errors persist; max 3 stacked | **Partial** | Relies on Sonner defaults; PR does not set `duration` / `visibleToasts` explicitly |
| Fixes `right: calc(var(--yawp-dev-panel-width) + 1rem)` clip on 390px | **Met (code)** | Mobile CSS resets `right`/`bottom` and centers at top |

## Checklist — Bug 3: Reporter title (chrome only)

| Requirement | Status | Notes |
| --- | --- | --- |
| `/app/reporter` mobile top bar **Reporter**, not Home | **Met (code + tests)** | `resolveAppMobileTopBarTitle` + prefix map; unit tests cover Home-only matches |
| limit / locked / normal states same title | **Met (code)** | Single route `/app/reporter`; prefix `/app/reporter` |
| pending → **Approval status**; settings → **Settings** | **Met (code + tests)** | Prefix entries; pending test |
| Document title **Reporter \| Yawp!** | **Met (code)** | `app.reporter` `meta` + mobile `useEffect` in `app/route.tsx` |
| No Reporter body/chart changes | **Met** | Diff is title resolver + meta only on reporter route |

## Scope / policy scan

| Check | Result |
| --- | --- |
| Kevin / TeacherKev PR surfaces | Not touched |
| User-facing **Yawp!** / no new “AI” copy in diff | OK |
| Feature flags / rollout | None added |
| Files touched | 12 (dev panel, toaster, app shell title, reporter meta, tests) |

## Ship-blocking defects

1. **TypeScript (CI + local):** `app/dev-panel/dev-panel-shell.tsx(637,13)` — `contentProps` passed into `DevPanelMobileBottomSheet` includes `'data-yawp-dev-panel'` (and related attrs) but the typed `SheetContent` props omit `data-*` keys. GitHub check **ʦ TypeScript** → **FAILURE** on run `40164240513`.
2. **Base freshness:** Branch merges cleanly into `main` @ `eab6a20cc…` but **does not contain** that commit (forked at `9d9c7a381…`, parent of #737). Rebase onto current `main` before merge.

## Residual manual smoke (post-fix)

- [ ] iPhone ~390 portrait: open dev tools, drag dismiss past 30%, flick dismiss, scrim tap, X, Esc; confirm focus on beaker.
- [ ] With sheet open: trigger populate-class success/error toasts; confirm top safe-area placement and no horizontal clip.
- [ ] `/app/reporter` and free-tier limit/locked UI: mobile header and tab title **Reporter**.
- [ ] Phone landscape 844×390: panel as right drawer.
- [ ] Desktop 1280: docked panel + flyout; toasts still bottom-right.

## Test results (this review)

Environment: detached checkout at reviewed head `0db07cc625b88aee66397eba123825e96480a6dc`; Bun `/home/ubuntu/.bun/bin/bun`; Docker unavailable.

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
| **Pass** | **13** tests, **0** failures (~321 ms) |

**Typecheck:** `bunx tsc --noEmit` (8 GB heap) reports the `dev-panel-shell.tsx` error above (matches CI).

**CI snapshot (PR branch, partial):** Changed paths ✅; Migration integration ✅; **TypeScript ❌**; E2E smoke shards largely ✅ while review was in progress (shards 2–3, 5–6 success).

## Required fixes to unblock

1. Fix `SheetContent` / `contentProps` typing (e.g. extend props with `data-*` attributes, or set `data-yawp-dev-panel` on `SheetContent` directly without an untyped literal).
2. Rebase `cursor/mobile-qa-fixes-0fdd` onto `main` @ `eab6a20cc0763a0de524702874627e312dbc3c1e` (or later) and re-run CI.
3. *(Optional polish)* Explicit Sonner `visibleToasts={3}` and success `duration` if defaults ever differ from design.

## Reviewer

Independent Ship Review r1 (Cursor Cloud Agent). Docs-only follow-up PR adds this file only; does not modify `cursor/mobile-qa-fixes-0fdd`.
