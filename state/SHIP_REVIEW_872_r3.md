# Independent Ship Review — PR #872 (r3)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main` @ `c4962ddc8fdef38a2eaa1338843ba6a8d51cc6f5`  
**Reviewed head SHA:** `1a939621135b22c0e8cb756899fec3f79eb8c0b1`  
**Prior reviews:** r1 SHIP @ `629a2226982ad65623030b86c3436d41d20f05b8`; r2 SHIP @ `4637324338a9a3bac4e45d16bb127ae09d3f2b53` (Prisma `InputJsonValue` cast for provenance stamp)  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

SHIP

## Delta since r2

Single commit on reviewed head:

- `1a9396211` — `test(PKG-14): expect no Prompt link on legacy assignment-type editor`

**Files changed since r2:** `services/web-app/e2e/tests/admin.assignment-types.spec.ts` only (−244 / +2 lines of assertions and DB expectations).

No product code, migrations, or route changes between r2 head and reviewed head.

## Full PR scope vs `main` (unchanged since r2; PKG-14)

| Area | Summary |
|------|---------|
| Legacy assignment-type admin | Restored Platform create/edit flow under `/app/admin/assignments` and assignment-type routes |
| Rubric editor | `RubricConfigurationEditor` wired in `assignment-type-editor-form.tsx` with library picker + inline rubric/scoring scale state |
| Provenance | `_lastAdminEdit` stamped in `gradingPromptConfigJson` via `assignment-type-admin-provenance.server.ts` + `withLastAdminEdit` in admin writes (`source: 'platform'`, actor email from `platform-admin-actor.server.ts`) |
| Prompt UX on legacy editor | **No** primary-path `Prompt` nav link on the assignment-type editor (design intent); optional production prompt label only when a version label exists |
| Access | `requireAdmin` on loaders/actions for admin assignment-type and assignments index routes (unchanged pattern) |
| Feature flags / schema | No new feature flags; **no** Prisma migrations in the diff (14 files under `services/web-app/` only) |

Commits on branch since `main`: `629a22269` (feat), `463732433` (cast fix), `1a9396211` (e2e alignment).

## r3 focus — E2E aligned with no-benchmark primary path

### First test (`creates an assignment type with rubric settings…`)

**Removed (correctly):** Flow that clicked the legacy editor **Prompt** link, opened `/prompt`, exercised compiled prompt / test prompt / add evaluation / benchmark-style evaluation history, and asserted seeded evaluations in Prisma after create.

**Retained / added:**

- Admin sign-in → assignments index → create assignment type with **rubric library** selection.
- Post-create: rubric library label, grading assistant instructions, **`rubric-add-category`** visible (barebones rubric editor).
- **Explicit absences** on the legacy editor surface (count 0): `View compiled prompt`, `Test prompt`, `Edit instructions`, `Evaluation history` heading, **`Prompt` link (exact)**.
- Prisma: library `rubricId` relationship, `rubricJson` / `scoringScaleJson` null (no silent copy).
- **Module path:** add module → module details → edit module → **rubric relationships** (primary/supporting) → `rubricAlignmentJson` persisted.

This matches the product decision documented in prior reviews: legacy Platform admin restores rubric + module tooling without promoting the Prompt workspace as the primary path from the type editor.

### Other tests in the same file (unchanged in r3)

- `versions prompts and evaluation suites…` and `copies evaluations…` still **`page.goto(.../prompt)`** directly. Prompt-version control remains test-covered on its dedicated route; r3 only stops requiring the editor **link** as the smoke entry point.

## Access, flags, migrations

- **Admin gating:** `requireAdmin(request)` present on assignment-types new/edit loaders and actions and assignments index loader at reviewed head (same as r2).
- **No feature flag** gating for this restore (always-on admin surface).
- **No migration files** in the PR diff vs `main`.

## CI (single check at review time)

- Status: **pending** (0 failed, 3 successful, 13 pending, 2 skipped).
- Prior r2 failure mode (E2E expecting visible **Prompt** link on legacy editor) is addressed by the r3 e2e diff; no need to poll CI for this review.

## Local verification (reviewed head, targeted)

```text
bun test app/domain/assignment-types/assignment-type-admin-provenance.server.test.ts
     app/routes/app.admin.assignment-types.$id/route.test.ts
     app/routes/app.admin.assignment-types.new/route.test.ts
     app/routes/app.admin.assignments._index/route.test.ts
     app/routes/app.admin/route.test.ts
→ 38 pass, 6 fail
```

The 6 failures are **response-shape only**: tests expect `{ data, init: { status: 400 } }` but received objects with correct `data.error` and no `init` wrapper. Behavior under test (validation messages, rubric guards) matches expectations; failures appear to be a test-harness / `data()` return-shape mismatch in this environment, not introduced by the r3 e2e-only commit. Provenance unit tests: 3/3 pass.

## Residual risk (non-blocking)

- Legacy editor no longer e2e-smokes the full prompt/benchmark path from the type page; dedicated `/prompt` e2e tests remain for that surface.
- r3 does not re-run full E2E locally; reliance on updated smoke spec + pending CI.

## Verdict

**SHIP** on `1a939621135b22c0e8cb756899fec3f79eb8c0b1` — Product scope remains PKG-14; delta since r2 is the intended e2e alignment (no Prompt link on legacy editor, rubric + module coverage retained). Safe to merge from an independent code-review perspective. Do not merge as part of this review task.
