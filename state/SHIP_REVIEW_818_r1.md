# Independent Ship Review — PR #818 (r1)

**Product:** Yawp!  
**Target PR:** https://github.com/The-Connell-School/yawp/pull/818  
**Title:** fix(e2e): deflake dev-panel artboard evidence (#8ad) [skip preview]  
**Branch:** `cursor/deflake-dev-panel-artboard-evidence-0e6d`  
**Base at open:** `8908d7c040bb6e64d3e2380506f1d6fae5926245`  
**Reviewed head:** `ab82bb41ec0f5fe5bb28988b2fcf06a8a672cbc3`  
**Reviewer:** Independent Composer ship review (not PR author)  
**Review date:** 2026-10-26 (UTC)

## Verdict

**SHIP** on head `ab82bb41ec0f5fe5bb28988b2fcf06a8a672cbc3`.

## Freshness

GitHub `headRefOid` for PR #818 matches the reviewed head exactly (`ab82bb41ec0f5fe5bb28988b2fcf06a8a672cbc3`). Diff reviewed as `origin/main...ab82bb41ec0f5fe5bb28988b2fcf06a8a672cbc3` (2 files, +41 / −12 lines).

## Claim vs diff

| PR claim | Verified |
|----------|----------|
| Flake: `Execution context was destroyed` on `localStorage.removeItem('yawp-dev-panel')` after free-tier jump | Consistent with racing `page.evaluate` against navigation; CI example cited in PR body (run 40309376333) was not re-run by this reviewer. |
| Root cause: `dev-panel-free-tier-flyout.tsx` schedules `window.location.assign(redirectTo)` after **350ms** | **Confirmed** on `main` at lines 178–180 (`setTimeout(..., 350)`). |
| Harness-only fix; no product UI changes | **Confirmed.** Only `services/web-app/e2e/helpers/dev-panel-feedback.ts` and `services/web-app/e2e/tests/dev-panel-artboard-evidence.spec.ts` change. |
| Opening: init-script storage reset + single `goto` (drop evaluate + reload) | **Matches diff.** `installDevPanelStorageReset` + `goto(..., { waitUntil: 'domcontentloaded' })`. |
| Post jump: `waitForURL` before restoring `assign`, wait for load, storage reset via init script on next dev-login `goto` | **Matches diff.** `postJumpNavigation` registered before `__restoreJumpAssign`, then `domcontentloaded`, `installDevPanelStorageReset`, dev-login, `goto`. |
| Sub-sheet localStorage tweak wrapped in `expect(...).toPass` after `domcontentloaded` | **Matches diff.** |
| Test intent unchanged (artboard evidence captures) | Screenshot sequence and assertions unchanged aside from navigation/storage synchronization. |

**Minor note (non-blocking):** `clearDevPanelStorageWhenStable` is added and exported in the helper module but is not referenced by the spec or elsewhere on this head. Harmless dead export; optional follow-up to use or remove.

## Kevin / #608 overlap

No overlap. Open PR **#608** (`feat/platform-enhancements`, platform enhancements behind a flag) touches unrelated product surface. This PR does not modify dev-panel React code, flags, or platform-enhancement paths. Kevin-named e2e comments elsewhere in the repo are unrelated lesson-planner specs.

## Scope, secrets, and product impact

- **Scope:** E2E harness and one evidence spec only; appropriate for quality sweep #8ad.
- **Secrets:** None introduced; dev-login uses existing fixture email `dev.teacher@yawp.local` (same as before).
- **Product / UI:** No runtime behavior change for Yawp! users.

## Verification notes (this review)

- Confirmed head SHA via `gh pr view 818` and local `git fetch` of branch tip.
- Read full diff and cross-checked 350ms redirect against `services/web-app/app/dev-panel/dev-panel-free-tier-flyout.tsx` on `main`.
- Did **not** merge PR #818.
- Did **not** run Playwright or `./bin/project bootstrap` locally (Docker/Postgres unavailable in this cloud VM, same constraint noted in PR body).
- CI on the PR branch was **in progress** at review time (Migration Integration + CI workflow); no failed required checks observed at query time. Merge should still wait for green **Demo feedback + preview access browser** (the job that runs this spec).

## Blockers

None for **SHIP** on the reviewed head.
