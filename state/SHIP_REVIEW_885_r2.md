# Independent Ship Review r2 — PR #885

**PR:** https://github.com/The-Connell-School/yawp/pull/885  
**Title:** Simplify Platform assignment type editor (rubric + universal tutor)  
**Branch:** `cursor/simplify-assignment-type-editor-7572`  
**Base:** `main`  
**Reviewed head SHA:** `9c56561b971ab5b634bd8ccdff93652c219d3f4e` (`9c56561b9`)  
**GitHub `headRefOid` at review time:** `9c56561b971ab5b634bd8ccdff93652c219d3f4e` — **matches; freshness OK**  
**Prior review:** [r1 @ `a2c9480ea`](./SHIP_REVIEW_885_r1.md) — **NO-SHIP**

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-29  

**SHIP**

---

## Delta since r1 (`a2c9480ea` → `9c56561b9`)

| r1 blocker | Fix @ `9c56561b9` | Verified |
| --- | --- | --- |
| Create route tests expected `tutorInstructions: null` | Removed from four `prisma.assignmentType.create` expectations in `app.admin.assignment-types.new/route.test.ts` | **Yes** — no `tutorInstructions` in that file; 12/12 create-route tests pass locally |
| E2E: **Update** disabled after library rubric pick (dirty snapshot bug) | `savedBuiltInGrammarControl = isEdit && !selectedRubricId` decouples saved rubric JSON snapshot from live `showBuiltInGrammarControl` (`!rubricId`) | **Yes** — CI shard 3 green on exact head; logic review confirms picking a library rubric no longer mutates `savedRubricSnapshot` mid-edit |

**Scope delta:** +4 / −6 lines in product code/tests (plus r1 review doc already on branch). Full PR vs `main`: 11 files, +255 / −196 @ `9c56561b9`.

---

## Product intent vs implementation @ `9c56561b9`

(Unchanged from r1 except where noted; re-checked on reviewed head.)

| Intent | Evidence | Result |
| --- | --- | --- |
| Remove General / Universal tutor instructions from Platform assignment-type editor | No `tutorInstructions` on `AssignmentTypeEditorForm`; create/update routes omit assignment-type tutor field from form writes | **Met** |
| Remove inline `RubricConfigurationEditor` on Platform editor | Form uses `RubricGrammarHighlightingControl` + `RubricLibrarySection` only; E2E asserts `rubric-add-category` absent | **Met** |
| Keep grammar highlighting for legacy built-in (non-library) rubrics | `showBuiltInGrammarControl` when `isEdit && !rubricId` | **Met** |
| Keep rubric library picker + grading assistant instructions | `RubricLibrarySection` with `gradingInstructions` state | **Met** |
| Module tutor settings unchanged | `AssignmentTypeModulesSection` on edit | **Met** |
| Generic tutor path: empty/null assignment-type `tutorInstructions` → `UNIVERSAL_TUTOR_BLOCK` | `buildTutorSystemPrompt`: `generalTutorInstructions?.trim() \|\| UNIVERSAL_TUTOR_BLOCK` | **Met** |
| Non-empty DB `tutorInstructions` still wins | Unit test “prefers assignment-type general tutor instructions over the universal block” | **Met** |

---

## Exact-head CI (required gate)

**Workflow:** https://github.com/The-Connell-School/yawp/actions/runs/40911632596  
**Run `headSha`:** `9c56561b971ab5b634bd8ccdff93652c219d3f4e` — **matches reviewed head**  
**Run conclusion:** `success`

| Check | Conclusion |
| --- | --- |
| ʦ TypeScript | pass |
| Prisma migrations | pass |
| 🧪 E2E smoke (shards 1–6) | pass |
| 🧪 E2E Tests (Playwright) | pass |
| Sign-on, demo feedback, free-tier preview, preview-deploy, changed paths | pass |

**CI is green on exact head.**

---

## Reviewer-executed tests @ `9c56561b9`

```text
bun test app.admin.assignment-types.new/route.test.ts
     app.admin.assignment-types.$id/route.test.ts
     build-system-prompt.test.ts
→ 44 pass, 0 fail
```

---

## Verdict

**SHIP**

**Reason:** GitHub `headRefOid` matches the claimed fix SHA; **exact-head CI is green** (run 40911632596); both r1 blockers are addressed with targeted changes; product intent for the simplified Platform editor and universal tutor fallback remains satisfied. **Do not merge from this review** — merge remains a separate human/product decision.
