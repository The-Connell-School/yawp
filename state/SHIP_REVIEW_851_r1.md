# Independent Ship Review r1 — PR #851

**PR:** https://github.com/The-Connell-School/yawp/pull/851  
**Title:** PKG-07: Locked free tier opens How It Works only; Reporter sidebar lock removed  
**Branch:** `cursor/pkg-07-locked-hiw-reporter-lp-5c7a`  
**Base:** `main` (`ad939f9fb`)  
**Reviewer:** Independent ship review (Cloud Agent; not the original PR author)  
**Date:** 2026-11-05  

**SHIP** — merge to `main` for demo when this head's CI is green. No new production flag.

---

## Rebase

Rebased the three PKG-07 commits onto current `main`. Conflicts in the sidebar usage file were resolved by keeping PKG-04 (no usage rings) and dropping the Reporter lock badge. The in-app "Unlocks after approval" card is unchanged.

---

## Product intent vs implementation

| Intent | Evidence | Result |
| --- | --- | --- |
| Locked tiles and direct type URLs open How It Works | `redirectLockedPreviewAssignmentTypeHomeToGuide`; locked tiles link to `assignmentTypeHowItWorksPath` | **Met** |
| Class Starter and writing-step guides restored | `class-starter-guide.tsx`, `writing-step-guide.tsx`, route branches | **Met** |
| Daily Pages does not grow a dead "See how it works" button | `assignmentTypeHasHowItWorksGuide` is true only for Class Starter, the thesis essay, and writing-step kinds. The guide route still redirects other titles home, which is what `teacher.thesis-essay-guide.spec.ts` asserts | **Met** |
| Reporter sidebar lock removed | `renderFreeTierNavTrailing` and `renderFreeTierNavRow` return null; locked-preview spec expects the lock test id count 0 | **Met** |
| Pending Lesson Planner still shows the composer when the planner flag is on | Locked-preview spec turns `feature_flag.lesson_planner` on for that assertion. The locked-preview CI database does not seed that flag, which is why the old head timed out looking for the composer | **Met** |
| Class Starter modules accordion hidden | `showModulesAccordion` returns false for `class_starter` | **Met** |

---

## Local checks

| Check | Result |
| --- | --- |
| `assignment-type-how-it-works.test.ts` | **pass** |
| `locked-preview-assignment-type-routing.server.test.ts` | **pass** |
| `route.test.ts` (assignment type page) | **pass** (22) |
| `free-account-usage.locked-tiles.test.tsx` | **pass** |
| `lesson-materials.test.ts`, writing-step `content.test.ts`, `how-it-works-guide.test.ts` | **pass** |

Playwright stays on CI.

---

## Risk notes (non-blocking)

- The Class Starter guide spec is not on the smoke shard list, so CI will not run it. The thesis-essay guide smoke spec still guards Daily Pages.
- Reporter page lock badge stays. PKG-07 keeps that card.

---

## Merge recommendation

**Approve merge to `main` for demo** after exact-head CI is green. L2 behind the existing free-tier lock. No schema, billing, or production data change.
