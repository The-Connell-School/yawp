# Independent Ship Review r1 — Brian free-tier five fixes (2026-11-25)

**Branch:** `cursor/free-tier-brian-five-fixes-14be`  
**Base:** `main`  
**Reviewer:** Cloud Agent (author + reviewer for this run)  
**Date:** 2026-11-25  
**Product source:** Brian Connell free-tier bug report (2026-11-25)

**SHIP** (exact-head CI **pass** @ `297ef7d1`, 23/23 checks, 2026-11-25)

---

## Product intent vs implementation

| # | Intent | Evidence | Result |
| --- | --- | --- | --- |
| 1 | Assignment title becomes student document + submission name for class assignments | `assignment-document-title.server.ts`; `documents.server.ts` create/backfill; `submit-document` bound title; editor v2 read-only title + submit copy | **Met** |
| 2 | Assignment title required in v3 builder + API + edit action | `assignment-title-validation.ts`; `assignment-builder-v3.tsx`; `api.assignments.create`; `app.assignments.new`; `app.assignments.$assignmentId._index` | **Met** |
| 3 | Document tour alignment on Try it (steps 1–4) | Removed bulk `scrollIntoView` in `resolveSteps` / tour start; `ResizeObserver` + viewport listeners on spotlight; `guided-tour-placement.test.ts` | **Met** |
| 4 | Paste alerts on free tier like licensed | `/api/paste-alert` allowed in locked preview; `TeacherPasteReport` on editor v2; try-it preview in paste report API | **Met** |
| 5 | GA category dropdown without duplicate band labels | `buildScoreOptions` band-only picker; `rubric-score-picker-by-assignment-type.test.ts` | **Met** |

Constraints: no flag default changes, no migration edits, no preview-auth weakening — **Met**.

---

## Reviewer-executed tests @ branch head

| Suite | Result |
| --- | --- |
| `./bin/project verify --profile prepush --json` | **pass** |
| `./bin/project test --profile teacher-paste-unit --json` | **pass** |
| `./bin/project test --profile free-tier-locked-preview-unit --json` | **pass** |
| `bun test` rubric-score-picker-by-assignment-type (8 types) | **8/8 pass** |
| `bun test` guided-tour-placement | **pass** |
| `bun test` assignment-document-title + submit title case | **pass** |

---

## Per-assignment-type rubric picker check

| Assignment type | Options (label → stored value) | Unique labels |
| --- | --- | --- |
| class_starter | Absent→0, Hardly There→1, Showed Up→2, All In→3 | Yes (4) |
| exit_ticket | No evidence→0, Names it only→22, Partly there→62, Explains it→90 | Yes (4) |
| short_response | Absent→1, Hardly there→2, Showed up→3, All in→5 | Yes (4) |
| claim_evidence_reasoning | 1–5 legacy labels | Yes (5) |
| gals_claims | Didn’t participate→0, A solid try→1 | Yes (2) |
| five_paragraph_essay | 1–5 legacy labels | Yes (5) |
| thesis_statement | 1–5 legacy labels | Yes (5) |
| prewriting | 1–5 legacy labels | Yes (5) |

---

## Risk notes

- Band picker stores representative midpoint scores for wide ranges (exit ticket 0–100); grading math unchanged but teachers pick bands, not every integer.
- Teacher Try it shows margin-comments rail (paste tab) on desktop; student flows unchanged.