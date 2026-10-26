# Independent Ship Review — PR #818 (r2)

**Product:** Yawp!  
**Target PR:** https://github.com/The-Connell-School/yawp/pull/818  
**Title:** fix(e2e): deflake dev-panel artboard evidence (#8ad) [skip preview]  
**Branch:** `cursor/deflake-dev-panel-artboard-evidence-0e6d`  
**Base at open:** `8908d7c040bb6e64d3e2380506f1d6fae5926245`  
**Reviewed head:** `a4c580dd057db36a6cf31d8a786e7a5db78ec11f`  
**Prior review:** r1 **SHIP** on `ab82bb41ec0f5fe5bb28988b2fcf06a8a672cbc3` (docs #819) — stale after CI failure on that head  
**Reviewer:** Independent Composer ship review (not PR author)  
**Review date:** 2026-10-26 (UTC)

## Verdict

**SHIP** on head `a4c580dd057db36a6cf31d8a786e7a5db78ec11f`.

## Freshness

GitHub `headRefOid` for PR #818 matches the reviewed head exactly (`a4c580dd057db36a6cf31d8a786e7a5db78ec11f`). Diff reviewed as `origin/main...a4c580dd057db36a6cf31d8a786e7a5db78ec11f` (2 files, +48 / −12 lines).

## Why r2 (head moved)

Commit `a4c580dd` (`fix(e2e): scope dev-panel storage clears to avoid draft wipe`) addresses CI failure on r1 head `ab82bb41`:

- **Demo feedback job** run [40314046714](https://github.com/The-Connell-School/yawp/actions/runs/40314046714): `dev-panel-artboard-evidence.spec.ts` expected Note `"Partly typed note before reload"`, received `""` after intentional `page.reload()` in the draft-restore artboard step.
- **Root cause (r1 regression):** sticky `page.addInitScript` from `installDevPanelStorageReset` cleared `yawp-dev-panel` on **every** navigation, including the draft-restore reload, wiping persisted feedback draft text.

## Claim vs diff (cumulative on r2 head)

| Claim | Verified |
|-------|----------|
| Original flake: `Execution context was destroyed` racing `localStorage.removeItem` against post-jump navigation | **Still mitigated.** Post-jump block registers `waitForURL` **before** `__restoreJumpAssign`, awaits navigation, then `domcontentloaded`. Storage clear uses `clearDevPanelStorageWhenStable` after stable `goto`, not evaluate during redirect. |
| r2: draft Note restore no longer wiped by init scripts | **Confirmed.** Sticky `installDevPanelStorageReset` removed from spec; opening and post-jump use `clearDevPanelStorageWhenStable` only at intended wipe points. Draft-restore `page.reload()` has no init-script clear attached. |
| Harness-only; no product UI | **Confirmed.** Only `services/web-app/e2e/helpers/dev-panel-feedback.ts` and `services/web-app/e2e/tests/dev-panel-artboard-evidence.spec.ts`. |
| 350ms `location.assign` in product (context for jump flake) | Unchanged on `main` in `dev-panel-free-tier-flyout.tsx`; this PR still does not modify that file. |

**Minor note (non-blocking):** `installDevPanelStorageResetOnce` is exported in the helper but unused on this head (spec uses `clearDevPanelStorageWhenStable` instead). Harmless; optional follow-up to delete or adopt.

## Kevin / #608 overlap

No overlap. PR **#608** (platform enhancements) and Kevin-named e2e elsewhere are unrelated. This change set is dev-panel **evidence** E2E only.

## Scope, secrets, and product impact

- **Scope:** E2E harness + one artboard evidence spec (#8ad quality sweep).
- **Secrets:** None; existing dev-login fixture email only.
- **Product / UI:** No runtime behavior change for Yawp! users.

## Verification notes (this review)

- Confirmed head SHA via `gh pr view 818` and `git fetch` of branch tip.
- Read full diff vs `origin/main` and incremental diff `ab82bb41..a4c580dd`.
- Cross-checked ab82bb41 CI failure log for the draft Note assertion.
- **CI on reviewed head:** workflow run [40315755201](https://github.com/The-Connell-School/yawp/actions/runs/40315755201) on `a4c580dd` — **success**, including **Demo feedback + preview access browser checks** (the job that runs `dev-panel-artboard-evidence.spec.ts`).
- Did **not** merge PR #818.
- Did **not** run Playwright locally (Docker unavailable in this cloud VM; same constraint as r1).

## Blockers

None for **SHIP** on the reviewed head.
