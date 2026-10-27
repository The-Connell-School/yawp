# Independent Ship Review — PR #878 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/878  
**Title:** fix: tutor back-nav no longer lands on soft-deleted Welcome module  
**Base:** `main` @ `bf743a555f8486637b861ae231da537a7d69f455`  
**Reviewed head SHA:** `de838e943f71b83e5b1c4c1dff08a41fd8744af8`  
**Reviewer:** Independent ship review (Cloud Agent; did not author PR)  
**Date:** 2026-10-27  

SHIP

## Scope vs author claims

Diff `main...de838e943f71b83e5b1c4c1dff08a41fd8744af8` (+167 / −21, 8 files):

| Area | Files |
|------|--------|
| Root-cause write-up | `PROOF.md` |
| Shared navigable-module helpers + forward/back/cmsIdx mapping | `services/web-app/app/routes/app_.documents_.$id/tutor/assignment-module-navigation.ts` |
| Tutor back/activate uses helpers | `.../tutor/tutor.tsx` |
| Prisma: exclude soft-deleted modules from nested `assignmentModules` | `app_.documents_.$id/route.tsx`, `app_.collab-documents_.$id/route.tsx`, `api.model.assignment-module-session/route.ts`, `api.model.assignment-module-session.$id/route.ts` |
| Loader: drop sessions whose module is soft-deleted | `app_.documents_.$id/route.tsx` |
| Unit tests (thesis-driven Welcome soft-deleted) | `.../assignment-module-navigation.test.ts` |

Matches the PR description. No unrelated product drive-bys.

## (1) Index-space mismatch — confirmed on `main`

**Forward** (`getNextAssignmentModuleId` on pre-fix `main`): resolves the next step by **current module id** in `assignmentModules` sorted by `position`. For Thesis-Driven Essay with soft-deleted Welcome still at `position: 0`, Pre-writing → Thesis skips Welcome because the current id is Pre-writing (index 1), not Welcome (index 0).

**Back** (`tutor.tsx` `activateCmsIdx` on pre-fix `main`): `prevCmsIdx = cmsIdx - 1`, then `targetModuleId = assignmentModules[targetIdx].id` — treating **cmsIdx** (index into ordered **sessions**, which omit deleted Welcome for new documents) as an index into the **unfiltered** nested `assignmentModules` list from the loader/API. On Thesis at `cmsIdx=1`, back used `targetIdx=0` → Welcome module id while URL index `0` meant Pre-writing in the session list. That asymmetry is real and sufficient to explain Bryant’s repro (forward skips Welcome, back briefly surfaces it).

**Fix alignment:** Back and explicit cmsIdx activation now map through `getNavigableAssignmentModules` (`deletedAt == null`, sorted by `position`) via `getAssignmentModuleIdForCmsIdx` and `getPreviousAssignmentModuleId`. Forward `getNextAssignmentModuleId` uses the same navigable set. Loader/API Prisma `where: { deletedAt: null }` on nested `assignmentModules`, plus filtering `orderedModuleSessions` to modules with `deletedAt == null`, keeps CMS data and session ordering consistent with that set.

**Over-filtering check:** Only rows with non-null `deletedAt` are excluded — the same rule already used when creating sessions (`documents.server.ts` `deletedAt: null`). Live assignment steps students should see are unchanged; soft-deleted Welcome is intentionally removed from navigation surfaces. Legacy documents that still have a Welcome **session** row are excluded from `orderedModuleSessions`; that is consistent with not routing students through a retired module.

**Residual (non-blocking):** `cmsIdx` still indexes the session list while `getAssignmentModuleIdForCmsIdx` indexes the full navigable module list. That assumes session order tracks navigable module order for the student’s path (true for the Welcome-soft-delete case where Welcome has no session). A gap (navigable module with no session) could mis-map indices; that predates this PR’s index bug and is out of scope for this fix.

## (2) TDD vs Bryant repro (Thesis Driven Essay)

Fixture-aligned suite in `assignment-module-navigation.test.ts` (`thesisDrivenModulesWithDeletedWelcome` mirrors prod-fidelity Welcome at `position: 0` with `deletedAt` set):

| Test | Bryant repro |
|------|----------------|
| Forward Pre-writing → Thesis | `>` skips Welcome |
| Back Thesis → Pre-writing | `<` must not land on Welcome |
| `getAssignmentModuleIdForCmsIdx(cms, 0)` on Thesis at `cmsIdx=1` | Back POST must not use Welcome id |

**Executed locally (reviewed head):**

```text
/home/ubuntu/.bun/bin/bun test services/web-app/app/routes/app_.documents_.$id/tutor/assignment-module-navigation.test.ts
→ 6 pass, 0 fail
```

No dedicated E2E for this tutor arrow path in the diff; unit coverage directly encodes the minimal repro steps in `PROOF.md` §Minimal unit repro.

## (3) `PROOF.md` — proof quality

**Verdict: hard enough to ship; not speculative.**

The doc ties symptom to concrete code paths (loader unfiltered nested modules, `activateCmsIdx` index lookup, id-based forward in `getNextAssignmentModuleId`, session ordering via `resolveCurrentAssignmentModuleSession`), cites prod-fidelity fixture id `cm1s5o51o001ilvfj1non1jms`, and gives a five-step minimal repro that matches the new tests. The referenced symptom video path is environment-local and was not replayed in this review; the logical proof stands on code + fixture + unit tests without it.

## (4) CI (single check, no polling)

At review time: **PENDING** (3 successful, 0 failed, 13 pending, 2 skipped). Required checks: 0 failed, 0 pending. Pending CI does not block this code review.

## (5) Blockers

None.
