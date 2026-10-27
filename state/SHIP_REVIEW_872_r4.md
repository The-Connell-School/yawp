# Independent Ship Review — PR #872 (r4)

**PR:** https://github.com/The-Connell-School/yawp/pull/872  
**Title:** PKG-14: Restore Platform legacy assignment admin + barebones rubric editor  
**Base:** `main`  
**Reviewed head SHA:** `2378ef6ccef03e5d7ce43b65e6434545ee9216d1`  
**Prior reviews:** r1 SHIP @ `629a2226982ad65623030b86c3436d41d20f05b8`; r2 SHIP @ `4637324338a9a3bac4e45d16bb127ae09d3f2b53`; r3 SHIP @ `1a939621135b22c0e8cb756899fec3f79eb8c0b1`  
**Reviewer:** Independent ship review (Cloud Agent)  
**Date:** 2026-10-27  

## Verdict

**SHIP**

## Delta since r3 (`1a9396211`)

Three commits on reviewed head; product delta is scoring-scale / unchanged-grading-config preservation plus E2E alignment (no scope expansion beyond PKG-14):

| Commit | Summary |
|--------|---------|
| `33e41fd5a` | `parseAdminUpdateGradingConfig` compares semantic rubric/scoring/prompt/output; returns `undefined` when nothing changed; omits `scoringScaleJson` when scale is semantically equal (including stored scale without `step` vs posted scale with default `step: 1`). Detail loader uses `parseScoringScale(course.scoringScaleJson)` for display. `parseScoringScale` no longer materializes `step: 1` on read when absent in stored JSON. |
| `de7832783` | Creator E2E: expect no `Prompt` link after library JSON sheet; expect `rubric-add-category` on detail when built-in default rubric editor is shown; library-selected flows unchanged. |
| `2378ef6cc` | Unit tests for unchanged POST handling and default-step semantic equality. |

No migrations, feature flags, or non–PKG-14 drive-bys in this delta.

## Full PR scope vs `main` (unchanged intent)

**17 files**, ~563 insertions / ~337 deletions — legacy Platform assignment-type admin (list, create, edit), barebones `RubricConfigurationEditor`, admin provenance (`_lastAdminEdit`), shared admin write helpers, route/unit coverage, and trimmed E2E for legacy UI (no Prompt/benchmark as primary path).

Commits on branch (oldest → newest):

1. `629a22269` — feat(PKG-14): restore platform legacy assignment admin and rubric editor  
2. `463732433` — fix(PKG-14): cast provenance stamp to Prisma InputJsonValue  
3. `1a9396211` — test(PKG-14): expect no Prompt link on legacy assignment-type editor  
4. `33e41fd5a` — fix(PKG-14): preserve scoring scale JSON on unchanged admin rubric POSTs  
5. `de7832783` — test(PKG-14): align assignment-type creator e2e with legacy admin rubric UI  
6. `2378ef6cc` — test(PKG-14): cover unchanged admin grading config POST handling  

## Confirmations

### (1) Product scope still PKG-14

- Admin assignment-type routes and editor form restore in-app rubric editing and library picker; Internal/benchmark Prompt flows are not the primary UX (E2E asserts absence of Prompt link and compiled/test prompt buttons on legacy editor surfaces).
- `_lastAdminEdit` provenance stamped on admin writes via `withLastAdminEdit` / `adminEditProvenance`.
- No new Prisma migrations in PR diff.

### (2) Creator E2E aligned with barebones rubric UI

`admin.assignment-type-creator.spec.ts` at reviewed head:

- Asserts `rubric-add-category` count **0** on `/new` before built-in default (library selection hides barebones editor chrome as designed).
- Covers library rubric + grading instructions through validation, create, reload, library JSON view (no `Prompt` link / compiled / test prompt controls).
- After clearing library on detail, expects `rubric-add-category` **visible** (built-in default editor).
- **`updating basics leaves legacy rubric configuration unchanged`**: title-only update must not rewrite `scoringScaleJson`, `rubricJson`, prompt/output JSON, calibration notes, or `gradingAssistantVersion`.

`admin.assignment-types.spec.ts` remains aligned: no Prompt link on detail; `rubric-add-category` visible after create-with-library path.

### (3) Basics-only / unchanged POST does not rewrite `scoringScaleJson`

- **`parseScoringScale`**: adds `step` only when present in stored/raw JSON; absent `step` stays absent (semantic default remains `normalizeScoreStep` at compare/display time).
- **`parseAdminUpdateGradingConfig`**: stable rubric JSON comparison; `scoringScaleSemanticallyEqual` uses `normalizeScoreStep` so `{…}` without `step` matches `{…, step: 1}`; returns **`undefined`** when rubric, scoring, prompt, and output are all unchanged → no grading columns written, no version bump.
- **Detail loader**: `scoringScale: parseScoringScale(course.scoringScaleJson)` (stored column, not resolved grading snapshot) avoids re-serializing a default step into hidden form fields on load.
- Route tests include **updates basics without rewriting or versioning the production grading config**.

### (4) Access control

- `requireAdmin` on loaders/actions for `app.admin.assignment-types.new`, `$id`, and `_index` (unchanged gating pattern).

### (5) Local verification (reviewed head checked out)

```text
bun test assignment-type-admin-writes.server.test.ts
     assignment-type-admin-provenance.server.test.ts
     app.admin.assignment-types.$id/route.test.ts
     app.admin.assignment-types.new/route.test.ts
→ 39 pass, 0 fail
```

### (6) CI (single check, no polling)

At review time: **PENDING** (E2E smoke shards 1–6, TypeScript, Prisma migrations, migration-integration, preview deploy, etc.). **0 failed** on first poll. r3 failure mode (E2E shard 3: Prompt link + `scoringScaleJson` rewrite) is addressed in delta above; pending CI does not block a code-level SHIP for r4.

## Blockers

None.
