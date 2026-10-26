# Independent ship review — PR #841 (r1)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/841 |
| **Title** | [skip preview] Dev panel v3 chrome (Claude Design delta) |
| **Branch** | `cursor/devpanel-v3-chrome-6c92` |
| **Reviewed head SHA** | `66c8b9e00b2ca9c90e5131f899ef72401a8300ad` |
| **Base** | `origin/main` (merge-base `6ce983c42`) |
| **Reviewer** | Independent ship review (Cloud Agent), 2026-10-26 |
| **Verdict** | **SHIP** |

Head SHA at review time matched the requested exact head. Review scope: full diff `origin/main...66c8b9e00b2ca9c90e5131f899ef72401a8300ad` only (9 files, +519 / −264).

## Summary

PR #841 is a **chrome-only** delta on the docked Developer tools panel: removes the environment badge, switches to border-only separation (panel, flyouts, org popover), denser 13px row layout with 12px insets, aligned header title + `ChevronsRight` close control, pinned Give feedback + footer, left-flyout row chevrons (`ChevronLeft`) for Free-tier and Give feedback, and locked-beaker padlock + tooltip copy. **No changes** to `dev-panel-provider.tsx`, route guards, runtime enablement, preview-access APIs, org seat scoping, or feedback submission servers.

## Must-fix checklist (NOTES / BRIEF)

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Remove Demo/environment badge from panel header; no environment line in feedback page-details UI | **Met** | `envBadge` / `Badge` / `Environment:` removed from `dev-panel-shell.tsx` and `dev-panel-fallback-shell.tsx`. Give feedback flyout `dl` on PR head lists only **From** (signed-out) and **Page** — no environment row (unchanged from main). |
| 2 | Header title + chevron same midline; 12px insets; ~32px section rows | **Met** | `yawp-dev-panel-header`, `--yawp-dev-panel-inset: 12px`, `--yawp-dev-panel-row-height: 32px` in `dev-panel.css`; header uses `align-items: center` + `size-7` icon button. |
| 3 | 1px border only on panel left edge and flyouts; beaker may keep small shadow | **Met** | `shadow-xl` / `shadow-lg` removed from shell, fallback, flyouts; `yawp-dev-panel-flyout-docked` + `box-shadow: none`; beaker retains `shadow-lg`. Org popover: `yawp-dev-panel-org-popover`. |
| 4 | Denser devtools aesthetic; section order; Give feedback + footer pinned bottom | **Met** | Shell row order: Sign in as → Free-tier states → Blackboard link → Tester tools; Give feedback in `mt-auto` block above `yawp-dev-panel-footer`. 13px / 30px login rows / 24px pills in CSS. |
| 5 | Give feedback when unlocked (incl. signed-out); Free-tier LEFT flyout; one flyout at a time | **Met** | Give feedback row still gated on `unlocked`. Flyouts remain `absolute … right-full` (left of panel). `openSubSheet` / single `subSheet` unchanged in provider. Row chevrons: `ChevronLeft` on Free-tier + Give feedback. |
| 6 | Reduced-motion safe | **Met** | `html.yawp-dev-panel-reduced-motion [data-yawp-dev-panel-flyout] { animation: none !important; }` |
| 7 | Locked beaker affordance (frame 01) | **Met** | `dev-panel-beaker.tsx`: padlock overlay when `previewAccessGateEnabled && !unlocked`; tooltip `Developer tools · locked · Alt+Shift+D`. |

## Auth / gate / secrets (strict)

| Check | Result |
| --- | --- |
| Production / env panel exclusion | **Unchanged** — no edits to `dev-panel-runtime.server.ts`, `dev-panel-route-guard.server.ts`, bundle guards. |
| Preview-access unlock flow | **Unchanged** — same `AccessCodeModal` POST to `/api/dev-panel/preview-access`; footer `Re-enter access code` form to `/auth/preview-access`. |
| Sign-in-as / org seat scope | **Unchanged** — `DevPanelOrgPicker` + dev-login forms unchanged except popover surface class. |
| New secrets or API surface | **None** — diff limited to shell CSS/TSX + static chrome test. |
| Weakening locked/unlocked gates | **None** — locked body still requires access code; beaker change is display-only using existing `unlocked` / `previewAccessGateEnabled`. |

`envBadge` is still computed and passed through `DevPanelProvider` for typing/mount props but is **not rendered** in shell or fallback on this head.

## Design alignment (frames 01–05)

Compared PR diff and author/design PNGs under `/workspace/design/devpanel-v3/`:

- **01 locked beaker:** Padlock + tooltip match frame intent (locked opens panel with lock UI inside — existing behavior).
- **02 unlocked default:** Header without badge, collapsed rows with org / free-tier summary / LTI / Copy URL, user row + pinned Give feedback + footer kbd chips — matches frame.
- **03 / 04 flyouts:** Border-only left docked flyouts; Give feedback and Free-tier copy uses “Yawp!” — matches frames.
- **05 signed-out /free + feedback:** Give feedback available when unlocked on signed-out pages — behavior preserved; row copy “Note, screenshot, URL” matches.

**Intentional scope note (documented in PR body):** Top-level **Data** section removed; class simulation actions live under **Tester tools** (not shown as separate rows in v3 frames). Wiring and `class-simulation` subSheet unchanged.

## Copy / product strings

- Panel chrome: “Developer tools”, “Give feedback”, “Yawp!” in feedback strings — no “Demo” badge, no “AI” in `services/web-app/app/dev-panel/*` user-facing strings on PR head.
- Access code modal still says “Unlock developer tools on this environment.” (pre-existing; not a panel badge).

## Tests

| Suite | Result (local, PR head checkout) |
| --- | --- |
| `dev-panel-shell-chrome.test.ts` (new) | Pass — badge/shadow/flyout classes/reduced-motion CSS/beaker lock strings |
| `dev-panel-provider.test.tsx` | Pass — unlock, restore, flyout instant switch |
| `dev-panel-flyout-instant.test.tsx` | Pass |
| `dev-panel-route-guard.server.test.ts` | Pass — prod 404, demo unlock |
| `dev-panel-production-guard.test.ts` | Pass |
| `dev-panel-free-tier-flyout.test.tsx` | Pass |
| `dev-panel-class-simulation-flyout.test.tsx` | Pass |
| `dev-panel-shell-boundary.test.tsx` | Pass |
| `./bin/project test --profile demo-feedback-unit` | Pass |

**Gap (non-blocking):** New chrome test is source-string based; it does not assert DOM section order or visual regression. Existing flyout/provider tests cover one-`subSheet` behavior. Recommend relying on CI **Demo feedback + preview access browser** and smoke shards before merge.

## CI at review time

GitHub Actions for PR #841 were **pending** (TypeScript, migrations, E2E smoke ×6, sign-on browser, demo feedback browser, free-tier locked preview). No failed checks observed at review snapshot. Merge should wait for green required checks; that is a **process** gate, not a code defect found in this review.

## Blockers

**None.**

## Advisories (ship with eyes open)

1. **Class simulation UX:** “Clear simulated data” still opens the same `class-simulation` subSheet as “Populate class” (same as pre-PR behavior); only chrome location moved under Tester tools.
2. **Follow-up hardening (optional):** Add a small shell test asserting section label order in `dev-panel-shell.tsx` source if string-regression tests remain the pattern.
3. **Confirm CI green** on head `66c8b9e00b2ca9c90e5131f899ef72401a8300ad` before merging #841.

## Decision

**SHIP** — Must-fix chrome items from NOTES/BRIEF are implemented; gates and unlock semantics are untouched; flyout and feedback behaviors preserved with passing targeted tests. No merge of #841 performed by this review.
