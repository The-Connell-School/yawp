# Independent ship review — PR #841 (r4)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/841 |
| **Title** | [skip preview] Dev panel v3 chrome (Claude Design delta) |
| **Branch** | `cursor/devpanel-v3-chrome-6c92` |
| **Reviewed head SHA** | `8b924cb606730d553c6b9c93254abbc1640682bb` |
| **Prior review** | r3 **SHIP** @ `f14c9adbbd96148984ffee28e2192a91e3470287` (docs #844, closed) |
| **Base** | `origin/main` (merge-base `6ce983c4207fc2fc4fa21f1f8d9e1df3266f73d7`) |
| **Reviewer** | Independent ship review (Cloud Agent), 2026-10-26 |
| **Verdict** | **SHIP** |

Head SHA at review time matched the requested exact head. Review scope: full diff `origin/main...8b924cb606730d553c6b9c93254abbc1640682bb` (10 files, +532 / −267).

## Delta since r3

| Commit | Scope |
| --- | --- |
| `8b924cb60` fix(e2e): scope Populate class click to panel row | **E2E helper only** — `services/web-app/e2e/helpers/dev-panel-feedback.ts` |

Confirmed: `git diff f14c9adbb..8b924cb60` touches one file (+2 / −1). **Product chrome and gate code are byte-identical to r3 head.**

## r1–r3 chrome and gate findings (re-validated)

Because application TSX/CSS under `app/dev-panel/` is unchanged since r3, all r1/r2/r3 conclusions on product behavior still apply.

| Area | r3 | r4 |
| --- | --- | --- |
| Must-fix NOTES/BRIEF chrome (no env badge, border-only flyouts, header alignment, denser rows, section order, pinned Give feedback, left flyouts, reduced motion, locked beaker) | SHIP | **Still met** — unchanged product diff vs r3 |
| `dev-panel-runtime.server.ts`, route guards, preview-access APIs, provider unlock | Unchanged | **Still unchanged** — not in PR diff |
| Class simulation under **Tester tools** (no top-level **Data** section) | Documented | **Still true** — panel row opens `class-simulation` subSheet; flyout action remains separate |
| Gate / prod exclusion / unlock semantics | No regressions | **No regressions** — diff still excludes guard/runtime modules |

### Local tests (head `8b924cb60`, detached checkout)

| Suite | Result |
| --- | --- |
| `dev-panel-shell-chrome.test.ts` | Pass |
| `dev-panel-provider.test.tsx` | Pass |
| `dev-panel-flyout-instant.test.tsx` | Pass |
| `dev-panel-class-simulation-flyout.test.tsx` | Pass |
| `dev-panel-route-guard.server.test.ts` | Pass |
| `dev-panel-production-guard.test.ts` | Pass |
| `dev-panel-runtime.server.test.ts` | Pass |
| `dev-panel-bundle.test.ts` | Pass |

## r4 focus: E2E strict-mode collision on **Populate class**

**Problem after r3:** Demo feedback browser CI could still fail because `openDevPanelClassSimulationFlyout` clicked `panel.getByRole('button', { name: 'Populate class', exact: true })`. After the row click opens the **Class simulation** dialog, a second button with the same accessible name exists inside `#devtools` (flyout primary action in `dev-panel-class-simulation-flyout.tsx`). Playwright strict mode then reported **two** matching buttons.

**Fix on `8b924cb60`:**

- Keep **Tester tools** expansion via `panel.getByRole('button', { name: /^Tester tools/ })` (unchanged from r3).
- Open class simulation by clicking `panel.locator('.yawp-dev-panel-login-row').filter({ hasText: 'Populate class' })` instead of role/name on any button under `#devtools`.

| Check | Result |
| --- | --- |
| Open-click scoped to panel row only | **Correct** — `.yawp-dev-panel-login-row` is the v3 shell row class (`dev-panel-shell.tsx`); flyout action is a full-width `Button` without that class |
| Dialog action no longer collides | **Correct** — flyout `Populate class` control is not selected by the row locator; strict-mode duplicate resolved |
| `/^Tester tools/` prefix retained | **Correct** — still used for section trigger (`Tester tools Copy URL` a11y name) |
| Scoped to dev panel | **Correct** — chain starts from `panel` (`#devtools`) |
| Does not reintroduce **Data** section | **Correct** — helper and shell omit Data |

## Auth / gate / secrets (strict, full PR diff)

Same as r1–r3: diff limited to dev-panel presentation + e2e helpers. No edits to production guards, preview-access handlers, dev-login, or feedback server routes. **No new secrets or API surface.**

## CI at review time

GitHub Actions for PR #841 @ `8b924cb60` had **Changed paths**, **TypeScript**, **migration-integration**, and preview policy/tooling **pass**; browser shards (including **Demo feedback + preview access browser**) were **pending**.

**Expectation:** The r4 helper change directly addresses the r3 failure mode (two `Populate class` buttons under `#devtools`). Merge should still wait for green required checks, especially **Demo feedback + preview access browser**.

## Blockers

**None.**

## Advisories (ship with eyes open)

1. **Confirm CI green** on head `8b924cb606730d553c6b9c93254abbc1640682bb` before merging #841 (process gate; r4 does not block on pending CI).
2. r1–r3 advisories unchanged: class-simulation “Clear simulated data” still opens the same subSheet as “Populate class”; optional shell source-order test remains nice-to-have.
3. Row-based selectors depend on v3 DOM classes; if login rows are renamed, update `openDevPanelClassSimulationFlyout` alongside product markup.

## Decision

**SHIP** — r1–r3 chrome and gate conclusions stand; the only post-r3 change correctly scopes the class-simulation **open** click to the Tester tools panel row and avoids the flyout action button strict-mode clash. No gate, unlock, or prod-exclusion regressions identified. Did not merge #841.
