# Independent ship review — PR #841 (r2)

| Field | Value |
| --- | --- |
| **PR** | https://github.com/The-Connell-School/yawp/pull/841 |
| **Title** | [skip preview] Dev panel v3 chrome (Claude Design delta) |
| **Branch** | `cursor/devpanel-v3-chrome-6c92` |
| **Reviewed head SHA** | `3fcc0d77f8dca69eb06690180bdeeaa298405e9d` |
| **Prior review** | r1 **SHIP** @ `66c8b9e00b2ca9c90e5131f899ef72401a8300ad` (docs #842, closed) |
| **Base** | `origin/main` (merge-base `6ce983c42` at r1; main advanced since snapshot) |
| **Reviewer** | Independent ship review (Cloud Agent), 2026-10-26 |
| **Verdict** | **SHIP** |

Head SHA at review time matched the requested exact head. Review scope: full diff `origin/main...3fcc0d77f8dca69eb06690180bdeeaa298405e9d` (10 files, +522 / −267).

## Delta since r1

| Commit | Scope |
| --- | --- |
| `3fcc0d77f` fix(e2e): open class simulation via Tester tools section | **E2E helper only** — `services/web-app/e2e/helpers/dev-panel-feedback.ts` |

Confirmed: `git diff 66c8b9e00..3fcc0d77f` touches one file, six lines. **Product chrome and gate code are byte-identical to r1 head.**

## r1 chrome / gate findings (re-validated)

Because application TSX/CSS under `app/dev-panel/` is unchanged since r1, all r1 conclusions on product behavior still apply. Spot-check on head `3fcc0d77f`:

| Area | r1 | r2 |
| --- | --- | --- |
| Must-fix NOTES/BRIEF chrome (no env badge, border-only flyouts, header alignment, denser rows, section order, pinned Give feedback, left flyouts, reduced motion, locked beaker) | SHIP | **Still met** — unchanged product diff vs r1 |
| `dev-panel-runtime.server.ts`, route guards, preview-access APIs, provider unlock | Unchanged | **Still unchanged** — not in PR diff |
| Top-level **Data** section removed; class sim under **Tester tools** | Documented | **Still true** — `dev-panel-shell.tsx` has `Tester tools` collapsible; no `Data` label on head |
| Gate / prod exclusion / unlock semantics | No regressions | **No regressions** — diff still excludes guard/runtime modules |

### Local tests (head `3fcc0d77f`, detached checkout)

| Suite | Result |
| --- | --- |
| `dev-panel-shell-chrome.test.ts` | Pass |
| `dev-panel-provider.test.tsx` | Pass |
| `dev-panel-flyout-instant.test.tsx` | Pass |
| `dev-panel-route-guard.server.test.ts` | Pass |
| `dev-panel-production-guard.test.ts` | Pass |
| `dev-panel-class-simulation-flyout.test.tsx` | Pass |
| `dev-panel-free-tier-flyout.test.tsx` | Pass |
| `dev-panel-shell-boundary.test.tsx` | Pass |
| `./bin/project test --profile demo-feedback-unit` | Pass |

## r2 focus: E2E helper fix

**Problem after r1:** Demo feedback browser CI failed because `openDevPanelClassSimulationFlyout` still expanded a removed **Data** section and clicked `Populate class Fake…` (regex), while v3 moved actions under **Tester tools** with an accessible name **Populate class**.

**Fix on `3fcc0d77f`:**

```ts
const panel = await openDevPanelSection(page, 'Tester tools');
await panel
  .getByRole('button', { name: 'Populate class', exact: true })
  .click();
```

| Check | Result |
| --- | --- |
| Targets **Tester tools** collapsible (`openDevPanelSection` uses `exact: true` on section trigger) | **Correct** — matches `CollapsibleTrigger` label in shell |
| Clicks panel row, not flyout primary action | **Correct** — scoped under `#devtools` panel; row opens `class-simulation` subSheet (same as pre-v3 wiring) |
| Does **not** reintroduce **Data** section | **Correct** — helper and shell omit Data |
| Button name matches UI | **Correct** — shell row text is `Populate class` (no “Fake” suffix on the row) |
| Consumers | `dev-panel-class-simulation.spec.ts`, `dev-panel-artboard-evidence.spec.ts` — unchanged call sites |

No other e2e references to `openDevPanelSection(page, 'Data')` on PR head.

## Auth / gate / secrets (strict, full PR diff)

Same as r1: diff limited to dev-panel presentation + one e2e helper. No edits to production guards, preview-access handlers, dev-login, or feedback server routes. **No new secrets or API surface.**

## CI at review time

GitHub Actions for PR #841 @ `3fcc0d77f` were **in progress** (TypeScript, migrations, E2E smoke ×6, sign-on browser, **Demo feedback + preview access browser**, free-tier locked preview). `Changed paths` and `migration-integration` had passed; preview deploy skipped per `[skip preview]`.

**Expectation:** The r2 helper change directly addresses the reported Demo feedback failure mode (missing **Data** section). Merge should still wait for green required checks, especially **Demo feedback + preview access browser**.

## Blockers

**None.**

## Advisories (ship with eyes open)

1. **Confirm CI green** on head `3fcc0d77f8dca69eb06690180bdeeaa298405e9d` before merging #841 (process gate; r2 does not block on pending CI).
2. r1 advisories unchanged: class-simulation “Clear simulated data” still opens the same subSheet as “Populate class”; optional shell source-order test remains nice-to-have.
3. r1 review artifact lived on closed docs PR #842; this r2 file is the authoritative independent review for head `3fcc0d77f`.

## Decision

**SHIP** — r1 chrome and gate conclusions stand; the only post-r1 change correctly aligns e2e with **Tester tools** / **Populate class** without restoring **Data**. No gate, unlock, or prod-exclusion regressions identified. Did not merge #841.
