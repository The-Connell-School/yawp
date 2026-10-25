# Independent Ship Review — PR #742 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/742  
**Branch:** `cursor/mobile-toast-equal-insets-8077` → `main`  
**Reviewed SHA:** `dc9e4ed7cfee4db10e6338f755dd62b5fd4a46d3`  
**Base (at review):** `bae06364c1867c6ad112b570aa59c6d330a9ef6a`  
**Remote HEAD at review time:** matched `dc9e4ed7cfee4db10e6338f755dd62b5fd4a46d3` (unchanged).

SHIP

## Scope

Diff vs `main` is limited to two files, as expected for post-#739 mobile toast gutter polish:

- `services/web-app/app/dev-panel/dev-panel.css`
- `services/web-app/app/dev-panel/dev-panel-mobile-styles.test.ts`

No locked-dashboard / tiles-v2, secrets, or unrelated product changes.

## Fix assessment

On `main`, mobile toasts used `left: 50%`, `transform: translateX(-50%)`, and `width: min(calc(100vw - 32px), 360px)` while Sonner’s `[data-sonner-toaster]` still applied its own positioning/transform — a common source of unequal left/right gutters.

The PR constrains the mobile toaster with symmetric `left`/`right: 1rem`, `width: auto`, and `transform: none`, then lays out each toast with `left`/`right: 0`, `width: auto`, `max-width: 360px`, and `margin-inline: auto`. Horizontal centering no longer fights the toaster offset.

Stack animation is preserved: toast `transform` is `var(--y) !important` instead of overriding with `translateX(-50%)`, so Sonner’s vertical stack variable remains authoritative on the toast node.

## Tests

`dev-panel-mobile-styles.test.ts` now asserts the toaster inset contract and `margin-inline: auto` instead of the removed viewport-width rule. Ran at reviewed SHA:

`bun test app/dev-panel/dev-panel-mobile-styles.test.ts` — pass (3 expectations).

## Regression check

- **Desktop:** `html.yawp-dev-panel-open [data-sonner-toast].yawp-dev-panel-jump-toast` bottom-right rules outside `@media (max-width: 639px)` are untouched; `Toaster` still uses `bottom-right` when not mobile.
- **Mobile jump toasts:** Still targeted inside the same `@media` block with `env(safe-area-inset-top)`; they share the updated horizontal layout with `.yawp-mobile-sonner-toast`.
- **Selectors:** Scoped to `[data-yawp-mobile-toast='true']` and dev-panel toast classes within the mobile breakpoint — no broad global Sonner overrides on desktop.

## CI note

GitHub checks on #742 were still running at review time; this review is code-scope only and does not block on CI completion.
