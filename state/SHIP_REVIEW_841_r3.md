# Independent ship review — PR #841 (r3)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/841 |
| **Title** | [skip preview] Dev panel v3 chrome (Claude Design delta) |
| **Branch** | `cursor/devpanel-v3-chrome-6c92` |
| **Reviewed head SHA** | `f14c9adbbd96148984ffee28e2192a91e3470287` |
| **Prior review** | r2 **SHIP** @ `3fcc0d77f8dca69eb06690180bdeeaa298405e9d` (docs #843, closed) |
| **Base** | `origin/main` (merge-base `6ce983c4207fc2fc4fa21f1f8d9e1df3266f73d7`) |
| **Reviewer** | Independent ship review (Cloud Agent), 2026-10-26 |
| **Verdict** | **SHIP** |

Head SHA at review time matched the requested exact head. Review scope: full diff `origin/main...f14c9adbbd96148984ffee28e2192a91e3470287` (10 files, +531 / −267).

## Delta since r2

| Commit | Scope |
| --- | --- |
| `f14c9adbb` fix(e2e): match Tester tools section by prefix a11y name | **E2E helper only** — `services/web-app/e2e/helpers/dev-panel-feedback.ts` |

Confirmed: `git diff 3fcc0d77f..f14c9adbb` touches one file (+10 / −1). **Product chrome and gate code are byte-identical to r2 head.**

## r1 / r2 chrome and gate findings (re-validated)

Because application TSX/CSS under `app/dev-panel/` is unchanged since r2, all r1/r2 conclusions on product behavior still apply.

| Area | r2 | r3 |
| --- | --- | --- |
| Must-fix NOTES/BRIEF chrome (no env badge, border-only flyouts, header alignment, denser rows, section order, pinned Give feedback, left flyouts, reduced motion, locked beaker) | SHIP | **Still met** — unchanged product diff vs r2 |
| `dev-panel-runtime.server.ts`, route guards, preview-access APIs, provider unlock | Unchanged | **Still unchanged** — not in PR diff |
| Class simulation under **Tester tools** (no top-level **Data** section) | Documented | **Still true** — `dev-panel-shell.tsx` `CollapsibleTrigger` shows `Tester tools` + row value `Copy URL`; `Populate class` row opens class-simulation subSheet |
| Gate / prod exclusion / unlock semantics | No regressions | **No regressions** — diff still excludes guard/runtime modules |

### Local tests (head `f14c9adbb`, detached checkout)

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

## r3 focus: E2E helper vs accessible name

**Problem after r2:** Demo feedback browser CI could still fail because `openDevPanelClassSimulationFlyout` called `openDevPanelSection(page, 'Tester tools')`, which resolves the section trigger with `getByRole('button', { name: sectionName, exact: true })`. On v3 chrome the **Tester tools** `CollapsibleTrigger` includes a trailing row value (`Copy URL`), so Playwright’s accessible name is **`Tester tools Copy URL`**, not an exact match for `Tester tools`.

**Fix on `f14c9adbb`:**

- Open panel via `openDevToolsPanel(page)` (scoped to `#devtools`).
- Expand **Tester tools** with `getByRole('button', { name: /^Tester tools/ })` (prefix match).
- Click **Populate class** with `getByRole('button', { name: 'Populate class', exact: true })` unchanged from r2.

| Check | Result |
| --- | --- |
| Matches real a11y name prefix for section trigger | **Correct** — `/^Tester tools/` matches `Tester tools Copy URL` without requiring product label changes |
| Scoped to dev panel | **Correct** — trigger lookup is on `panel` from `#devtools` |
| **Populate class** row selector | **Correct** — visible label remains `Populate class`; `exact: true` avoids ambiguous partial matches |
| No product change required | **Correct** — row value `Copy URL` is intentional v3 chrome; test adapts to computed a11y name |
| Does not reintroduce **Data** section | **Correct** — helper and shell omit Data |

`openDevPanelSection` remains available for sections whose accessible name equals the section title alone (e.g. **Sign in as**); only class-simulation navigation needed the prefix workaround.

## Auth / gate / secrets (strict, full PR diff)

Same as r1/r2: diff limited to dev-panel presentation + e2e helpers. No edits to production guards, preview-access handlers, dev-login, or feedback server routes. **No new secrets or API surface.**

## CI at review time

GitHub Actions for PR #841 @ `f14c9adbb` were **in progress** (TypeScript, migrations, E2E smoke ×6, sign-on browser, **Demo feedback + preview access browser**, free-tier locked preview). `Changed paths` and preview policy/tooling had passed; preview deploy skipped per `[skip preview]`.

**Expectation:** The r3 helper change directly addresses the r2 failure mode (`exact: true` on **Tester tools** vs **`Tester tools Copy URL`**). Merge should still wait for green required checks, especially **Demo feedback + preview access browser**.

## Blockers

**None.**

## Advisories (ship with eyes open)

1. **Confirm CI green** on head `f14c9adbbd96148984ffee28e2192a91e3470287` before merging #841 (process gate; r3 does not block on pending CI).
2. r1/r2 advisories unchanged: class-simulation “Clear simulated data” still opens the same subSheet as “Populate class”; optional shell source-order test remains nice-to-have.
3. If future v3 rows add more visible text inside `CollapsibleTrigger`, prefix or role-based selectors may need the same pattern as **Tester tools**.

## Decision

**SHIP** — r1/r2 chrome and gate conclusions stand; the only post-r2 change correctly aligns e2e with the **Tester tools** section’s computed accessible name without changing product labels. No gate, unlock, or prod-exclusion regressions identified. Did not merge #841.
