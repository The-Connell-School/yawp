# Independent Ship Review — PR #872 (r1)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main`  
**Reviewed head SHA:** `629a2226982ad65623030b86c3436d41d20f05b8`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Scope vs author claims

Diff `origin/main..629a2226982ad65623030b86c3436d41d20f05b8` touches **13 files** (+403 / −69), all in Platform admin assignment-type surfaces:

| Area | Files |
|------|--------|
| Legacy editor UI | `app/components/admin/assignment-type-editor-form.tsx` |
| Cross-UI provenance | `assignment-type-admin-provenance.server.ts` (+ unit test) |
| Write path stamping | `assignment-type-admin-writes.server.ts`, `platform-admin-actor.server.ts` |
| Routes + tests | `app.admin.assignment-types.$id`, `.new`, `app.admin.assignments._index`, `app.admin` |

No Prisma migrations, packages, Internal app, feature flags, or unrelated routes in this diff. Scope matches PKG-14 admin restoration.

## Legacy UI vs new chrome

1. **Internal migration banners removed** from assignment-type index and edit route; amber “moved to Yawp Internal” blocks are gone.
2. **Admin tab label** restored from `Assignment Types (moved)` to `Assignment Types` (`app.admin/route.tsx` + test).
3. **Rubric editing** re-wires the existing `RubricConfigurationEditor` from `rubric-config-editors.tsx` on **edit** only (import/copy, scoring scale, categories via hidden `scoringScale` / `rubricJson` fields — same names `parseAdminUpdateGradingConfig` expects). Create flow still defers rubric management until after first save.
4. **`RubricLibrarySection`** remains below the inline editor (library attach + grading instructions textarea) — not a parallel new UI.
5. **Grading assistant section** with primary **Prompt** link removed from the editor; production prompt label remains as read-only text when version control is enabled. Dedicated route `/app/admin/assignment-types/:id/prompt` is unchanged on `main` and not deleted — aligns with “barebones rubric, no benchmark/prompt matrix as primary path.” No benchmark UI added or promoted in this diff.
6. **Tutor settings / modules / Show chat button** are unchanged in this PR (still `AssignmentTypeModulesSection` + module detail route with “Show chat button” at `app.admin.assignment-types.$id_.modules_.$moduleId/route.tsx`). Author claims describe the restored admin surface, not net-new work in this commit.

Git history: `RubricConfigurationEditor` was present in the original assignment-type editor overhaul and removed in `c23f4ad0d`; this commit restores that wiring rather than inventing a new editor.

## Data model / prod safety

- **No schema or migration files** in the diff.
- Writes continue through existing `createAssignmentType` / `updateAssignmentType` paths to `AssignmentType` columns (`scoringScaleJson`, `rubricJson`, `gradingPromptConfigJson`, etc.) — same tables Internal uses.
- **`_lastAdminEdit`** is an additive key inside `gradingPromptConfigJson` (merged via `withLastAdminEdit`; other prompt keys preserved — covered by unit tests). No data fork.

## Access control

- Loaders and actions on assignment-type admin routes still call **`requireAdmin(request)`** (verified on `$id` loader/action and `.new` action).
- **`resolvePlatformAdminActorEmail`** uses `requireUserId` + user email lookup for provenance only; it does not bypass admin checks.

No feature flag gates the restored UI (consistent with author note and Bryant OK for demo+prod after merge).

## Tests (local)

At reviewed head, with `/home/ubuntu/.bun/bin/bun test`:

| Suite | Result |
|-------|--------|
| `assignment-type-admin-provenance.server.test.ts` | 3/3 pass |
| `app.admin/route.test.ts` | 4/4 pass |
| `app.admin.assignments._index/route.test.ts` | 3/3 pass |
| `app.admin.assignment-types.$id/route.test.ts` | 22/23 pass (1 failure — see note) |
| `app.admin.assignment-types.new/route.test.ts` | 7/12 pass when run in combined batch |

**PR-specific expectations pass:** provenance read/merge/format; tab label; index without Internal chrome; action payloads include `platformAdminEditStamp` on grading-related saves.

**Note:** Six route tests expect `init: { status: 400 }` on `dataResponse` errors; those cases pass when run in isolation on both `main` and PR head but fail when multiple route test files import in one `bun test` invocation (mock/module load ordering). Not introduced by this diff; not a ship blocker for code review.

## CI (single check at review time)

- **PASS:** Changed paths, preview-policy, Preview tooling  
- **PENDING:** TypeScript, Prisma migrations, E2E shards, migration-integration, browser jobs  
- **FAIL:** none  
- **Required checks:** 0 failed, 0 pending (required subset)

Pending full CI is acceptable per review instructions.

## Residual (non-blocking)

- Editors must use the separate Prompt route URL if they need the full prompt matrix; the main edit page no longer surfaces that button (intentional per PR scope).
- Title-only saves without rubric hidden fields do not stamp `_lastAdminEdit` unless other grading/tutor fields change — reasonable for “grading-related saves” wording.

## Verdict

**SHIP** — Scoped restoration of legacy Platform assignment-type admin (banners removed, tab label fixed, `RubricConfigurationEditor` back on edit), provenance stamping on shared JSON, admin-gated, no schema surprises. Safe to merge from an independent review perspective; this review does not merge.
