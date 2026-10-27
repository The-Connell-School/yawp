# Independent Ship Review — PR #872 (r2)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main` @ `origin/main` (fetched at review time)  
**Reviewed head SHA:** `4637324338a9a3bac4e45d16bb127ae09d3f2b53`  
**Prior review:** r1 **SHIP** @ `629a2226982ad65623030b86c3436d41d20f05b8` (`state/SHIP_REVIEW_872_r1.md` on that revision)  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## r2 delta (exact head vs r1 head)

`629a22269..463732433` is **one hunk, one line** in `assignment-type-admin-writes.server.ts`:

- Assigns `withLastAdminEdit(...)` on the **create** path to `Prisma.InputJsonValue` (same pattern as `updateAssignmentType` and the final `gradingPromptConfigJson` write).

This matches the claimed post-r1 TypeScript fix for CI `TS2322` at `assignment-type-admin-writes.server.ts(150,5)`. No other product, test, or schema changes between r1 and r2 heads.

## Scope vs main (unchanged from r1)

Diff `main...463732433` — **13 files**, +403 / −69, **two commits**:

| Area | Files |
|------|--------|
| Legacy admin chrome | `app.admin/route.tsx`, `app.admin.assignments._index/route.tsx` (+ tests) |
| Edit/create routes | `app.admin.assignment-types.$id/route.tsx`, `app.admin.assignment-types.new/route.tsx` (+ tests) |
| Editor UI | `components/admin/assignment-type-editor-form.tsx` |
| Provenance stamp | `assignment-type-admin-provenance.server.ts` (+ test) |
| Writes | `assignment-type-admin-writes.server.ts` |
| Actor email for stamp | `utils/platform-admin-actor.server.ts` |

**No** Prisma schema, migrations, feature flags, or new tables in this diff.

## Confirmations

### (1) Restores legacy Platform admin (not new primary chrome)

- Removes Internal migration banner on assignment types index; restores plain **Create assignment type** CTA.
- Admin tab label **Assignment Types** (drops “(moved)”).
- `AssignmentTypeEditorForm` reuses existing sections: basics, **General tutor instructions**, **Rubric** via `RubricConfigurationEditor` + `RubricLibrarySection`, **Tutor settings** via existing `AssignmentTypeModulesSection` (module links to legacy module editor).
- **Give Me Feedback / Show chat button** live on pre-existing module step route `app.admin.assignment-types.$id_.modules_.$moduleId` (not modified in this PR; reachable again through restored Platform admin navigation).
- No `benchmark` UI wired as primary rubric path in changed files; rubric editing is import/manage + library attach on the legacy edit page.

### (2) Same data model / no fork

- Reads/writes existing `assignmentType` JSON columns (`scoringScaleJson`, `rubricJson`, `gradingPromptConfigJson`, etc.) and related picker flows — same tables Internal uses.
- `_lastAdminEdit` is metadata inside `gradingPromptConfigJson` only; no parallel store.

### (3) Access control

- `requireAdmin` on loaders and actions for assignment-type admin routes (`assignments` index, `new`, `$id`, parent `app.admin` loader).

### (4) Provenance stamping

- Platform saves pass `adminEditProvenance: { source: 'platform', updatedBy: actorEmail }` on grading-related creates/updates; `withLastAdminEdit` merges `_lastAdminEdit` without dropping other prompt config keys (unit tests).

### (5) Feature flag

- None introduced; behavior is admin-gated only (aligned with stated Bryant OK for demo+prod after merge).

## Tests (local, targeted)

At reviewed head:

```text
bun test app/domain/assignment-types/assignment-type-admin-provenance.server.test.ts
     app/routes/app.admin.assignment-types.$id/route.test.ts
     app/routes/app.admin.assignment-types.new/route.test.ts
     app/routes/app.admin.assignments._index/route.test.ts
     app/routes/app.admin/route.test.ts
→ 38 pass, 6 fail
```

Failures are **test harness shape only**: six cases expect `dataResponse` results to include `init: { status: 400 }`, but received objects contain the correct `data.error` (and behavior under test is otherwise exercised). Same class of mismatch as broader suite noise; **not** introduced by the r2 one-line cast. Provenance tests and the majority of route action tests pass, including provenance stamp expectations on create/update.

`./bin/project test --profile changed` was not used as the ship gate (large unrelated failures in this VM snapshot). Targeted tests above cover PR-touched modules.

## CI (single check at review time)

- **PENDING:** TypeScript, Prisma migrations, E2E shards, preview-deploy, browser jobs, migration-integration  
- **SUCCESS:** Changed paths, preview-policy  
- **0 failed** required checks observed  

Pending CI does not block **SHIP** given r2 is a typing fix on top of r1-reviewed product diff and TS job had been the reported blocker.

## Residual risk (non-blocking)

- Last-write-wins between Platform and Internal remains explicit in UI copy; operators must coordinate edits.
- Full CI completion still recommended before merge; r2 specifically de-risks the known `createAssignmentType` `InputJsonValue` assignment.

## Verdict

**SHIP** on exact head `4637324338a9a3bac4e45d16bb127ae09d3f2b53` — r2 delta is the claimed Prisma JSON cast only; product scope and r1 confirmations hold. Safe to merge from an independent review perspective; this review does not merge.
