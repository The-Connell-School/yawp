# Independent Ship Review r1 — PR #885

**PR:** https://github.com/The-Connell-School/yawp/pull/885  
**Title:** Simplify Platform assignment type editor (rubric + universal tutor)  
**Branch:** `cursor/simplify-assignment-type-editor-7572`  
**Base:** `main`  
**Reviewed head SHA:** `a2c9480ea78380ccb9a38b5099b616d322076cfc` (`a2c9480ea`)  
**GitHub `headRefOid` at review time:** `a2c9480ea78380ccb9a38b5099b616d322076cfc` — **matches; freshness OK**

**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-29  

**NO-SHIP**

---

## Product intent vs implementation @ `a2c9480ea`

| Intent | Evidence | Result |
| --- | --- | --- |
| Remove General / Universal tutor instructions from Platform assignment-type editor | `AssignmentTypeEditorForm` no longer accepts `tutorInstructionsDefaultValue`; `updateCourse` / create routes stop reading/writing assignment-type `tutorInstructions` from this form | **Met** |
| Remove inline `RubricConfigurationEditor` (scoring scale, categories, import/paste) on Platform editor | Form uses `RubricGrammarHighlightingControl` + `RubricLibrarySection` only; E2E asserts `rubric-add-category` / paste controls absent | **Met** |
| Keep grammar highlighting for legacy built-in (non-library) rubrics | `RubricGrammarHighlightingControl` when `isEdit && !rubricId` | **Met** |
| Keep rubric library picker + grading assistant instructions | `RubricLibrarySection` unchanged in role | **Met** |
| Module tutor settings unchanged | `AssignmentTypeModulesSection` + module create still posts `#tutorInstructions` | **Met** |
| Generic tutor path: empty/null assignment-type `tutorInstructions` → `UNIVERSAL_TUTOR_BLOCK` | `buildTutorSystemPrompt`: `generalTutorInstructions?.trim() \|\| UNIVERSAL_TUTOR_BLOCK`; wired from `api.domain.tutor-response/route.ts` via `assignmentType?.tutorInstructions`; unit tests added | **Met** |
| Non-empty DB `tutorInstructions` still wins | `buildTutorSystemPrompt` prefers trimmed override; existing column untouched unless other admin paths write it | **Met** |

**Backward compatibility note:** Platform admins can no longer view or edit assignment-type-level tutor text on this screen. Runtime still honors stored values; empty/null types now get the universal block at tutor time (intended). No migration required.

**Scope:** 9 files, +156 / −192 (`origin/main...a2c9480ea`).

---

## Exact-head CI (required gate)

**Workflow:** https://github.com/The-Connell-School/yawp/actions/runs/40909301068  
**Run conclusion:** `failure` (all jobs terminal on reviewed push)

| Check | Conclusion | Notes |
| --- | --- | --- |
| ʦ TypeScript | **fail** | Step “Assignment type write API contracts” — `app.admin.assignment-types.new/route.test.ts` (4 fails) |
| Prisma migrations | **fail** | Same `route.test.ts` failures in bundled unit step (not a migrate/apply failure) |
| 🧪 E2E smoke (shard 3) | **fail** | 2 failures in `admin.assignment-type-creator.spec.ts` |
| 🧪 E2E Tests (Playwright) | **fail** | Aggregate failure driven by shard 3 |
| migration-integration | pass | |
| E2E smoke shards 1,2,4,5,6 | pass | |
| Sign-on, demo feedback, free-tier preview, preview-deploy | pass | |

**CI is not green on exact head — merge blocked.**

---

## Blockers (must fix before SHIP)

### 1. Stale create-route unit tests (TypeScript + Prisma migration jobs)

`app.admin.assignment-types.new/route.tsx` no longer sends `tutorInstructions: null` on create, but `route.test.ts` still expects it in four `prisma.assignmentType.create` assertions.

Example CI signal:

```text
-       "tutorInstructions": null,
- Expected  - 1
+ Received  + 0
  at app/routes/app.admin.assignment-types.new/route.test.ts:245:42
```

**Fix:** Update expectations (or document intentional explicit null in create helper if product requires it).

### 2. Assignment-type creator E2E — Update stays disabled

Shard 3, `e2e/tests/admin.assignment-type-creator.spec.ts`:

- `a new assignment type saves first and can then choose a library rubric` — after selecting “Daily Pages engagement”, `Update` remains **disabled** (failed through retries).
- Related flow: `updating an assignment type from the detail page must not oops` — same `Update` enablement failure pattern in CI log.

**Fix:** Restore dirty/submit behavior when rubric library selection or basics change (likely `AssignmentTypeEditorForm` dirty snapshot / `showBuiltInGrammarControl` transition), or correct E2E if UX intentionally changed (product intent suggests save-on-rubric-change should still work).

---

## Reviewer-executed tests @ `a2c9480ea`

```text
bun test build-system-prompt.test.ts app.admin.assignment-types.$id/route.test.ts
→ 32 pass, 0 fail
```

Not run locally: full `route.test.ts` for `assignment-types.new` (known failing on CI).

---

## Verdict

**NO-SHIP**

**Reason:** Product implementation aligns with stated intent, but **exact-head CI is red** due to PR-owned test gaps (create `route.test.ts`) and **Platform editor E2E regressions** on enabling **Update** after rubric/title edits. Re-run CI after fixes; no merge from this review.
