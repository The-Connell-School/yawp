# Independent Ship Review — PR #872 (r7)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main`  
**Reviewed head SHA:** `532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8`  
**Prior ship head:** `04117e98dbaf266914846dced8110c8f1da2943f` (r6)  
**Reviewer:** Independent ship review (Cloud Agent; not PR author)  
**Date:** 2026-10-27  

**SHIP**

## Delta since r6

`git diff 04117e98dbaf266914846dced8110c8f1da2943f..532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8` — **3 files** (+75 / −2):

| File | Change |
|------|--------|
| `services/web-app/app/components/admin/rubric-config-editors.tsx` | Add `data-testid="rubric-paste-open"` on the legacy rubric **Paste text** button. |
| `services/web-app/app/routes/app.admin.assignment-types.$id/route.tsx` | Load `tutorInstructions` on update; stamp cross-UI provenance only when tutor text **semantically changes**, not merely because the field is present on the full editor POST. |
| `services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts` | Regression: full-form resubmit (title + empty tutor + unchanged rubric/scale) must not write `gradingPromptConfigJson` / `_lastAdminEdit`. |

No migrations, feature flags, or unrelated product edits in this delta.

## E2E failure root causes (addressed)

1. **`rubric-paste-open` missing** — `admin.assignment-type-creator.spec.ts` expects the Paste text affordance on the assignment-type detail editor (`getByTestId('rubric-paste-open')`). The test id is now on the outline button that opens the paste sheet in `RubricImportPanel`. Matches existing e2e usage in `admin.rubric-library.spec.ts` / `admin.rubric-category-options.spec.ts` (count 0 when hidden).

2. **Title-only save stamped `_lastAdminEdit`** — Full `AssignmentTypeEditorForm` POST always includes `tutorInstructions`. r6 treated `formData.has('tutorInstructions')` as a grading-adjacent edit for `stampCrossUiProvenance`, which forced `adminEditProvenance` and a `gradingPromptConfigJson` write via `updateAssignmentType` even when rubric/scale/prompt were unchanged. r7 compares trimmed submitted tutor text to stored `existing.tutorInstructions` and only stamps when they differ.

## Product intent (full PR vs `main`; unchanged bar from r1–r6)

Re-verified at `532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8`:

- **Legacy Platform assignment-type admin** restored with barebones in-form rubric editor (`RubricConfigurationEditor` on edit) plus library picker; admin index/create/detail routes unchanged in scope vs prior ships.
- **`requireAdmin`** on loader/action paths for assignment-type admin routes (no weakening).
- **No PKG-14 feature flag** in `git diff origin/main..532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8`; no new Prisma migrations in that diff.
- **Grading write preservation:** `parseAdminUpdateGradingConfig` still returns `undefined` when semantic rubric/scale/prompt/output unchanged (including default `step: 1` on POST vs stored scale without `step`).
- **`_lastAdminEdit`:** Still applied when grading config actually changes, override changes, per-type rubric selection, or **real** tutor-instruction edits — not on unchanged full-form resubmits.

## `_lastAdminEdit` / grading regression check (r7 scope)

| Scenario | Expected | r7 behavior |
|----------|----------|-------------|
| Title/description only POST (no tutor field) | No grading writes | Unchanged (`hasTutorInstructions` false → no tutor stamp). |
| Full editor POST, tutor unchanged (incl. empty ↔ null) | No `gradingPromptConfigJson` write | `tutorInstructionsChanged` false; covered by new route test. |
| Tutor text actually changes | Persist tutor + cross-UI stamp | `tutorInstructionsChanged` true → `adminEditProvenance` (unchanged intent from PKG-14). |
| Rubric/scale/prompt change | Version + selective JSON writes | Still via `parseAdminUpdateGradingConfig` / override paths. |

No broadening of provenance stamping beyond fixing the false positive on unchanged tutor field presence.

## Local verification (reviewed head)

Checked out `532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8` and ran:

```text
bun test app/routes/app.admin.assignment-types.$id/route.test.ts
     app/domain/assignment-types/assignment-type-admin-provenance.server.test.ts
     app/domain/assignment-types/assignment-type-admin-writes.server.test.ts
→ 28 pass, 0 fail
```

## CI (single observation; not polled)

At review time on commit `532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8`:

- **PASS:** Changed paths, preview-policy, Preview tooling (3 successful).
- **PENDING:** migration-integration, Prisma migrations, TypeScript, E2E shards 1–6, sign-on and preview browser jobs, preview-deploy.
- **FAILED:** none observed; required checks 0 failed / 0 pending (per GitHub required-check summary).

Pending full matrix is acceptable; r7 directly targets the two reported E2E failures with unit regression coverage.

## Verdict

**SHIP** @ `532da3b7f4b06f033b7f9d74f50cc8a30d7b0bc8` — Scoped fixes for E2E test id and provenance false positive; product intent and admin gating unchanged from r1–r6. No blockers identified. This review does not merge.

**Blockers:** none
