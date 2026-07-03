# Assignment Type Rubric And Tutor Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** Move rubric, grading, and tutor configuration onto `AssignmentType`; migrate existing grading assistant template data into assignment types; remove the standalone reusable grading assistant template product model; and add module-level rubric relationship settings using `primary`, `supporting`, `preparatory`, and `not-applicable`.

**Architecture:** `AssignmentType` becomes the source of truth for the assignment base/preset/template. It owns the rubric and scoring configuration. Tutor settings and grading assistant behavior both read from that same rubric. Teachers can still customize teacher-level assignment fields, but admins own rubric and tutor architecture.

**Tech stack:** React Router route modules, Prisma/Postgres, Bun/Vitest unit tests, Playwright e2e tests, existing admin UI components.

---

## Product Decisions To Preserve

- The admin top-level tab is `Assignments`, not `Assignments & Grading`.
- Assignment types are the product concept. Standalone grading assistant templates are not.
- One assignment type has one rubric. If an admin wants reuse, they copy from another assignment type rather than linking to shared rubric state.
- Existing grading assistant template data should be kept by copying it onto assignment types during migration.
- Grading assistant template backward compatibility is not required because it has not shipped, but live assignment/document/student flows still must not regress.
- If an assignment type has no rubric/grading config, grading silently defaults to the Thesis grading config.
- Tutor modules get module-level rubric relationships only. Do not implement instruction-level relationships.
- The only rubric relationship options are:
  - `primary`: this module directly teaches, practices, or reviews the category.
  - `supporting`: this category matters as a secondary lens, but the module should not center on it.
  - `preparatory`: this module builds material or skill that later supports the category, but should not evaluate final mastery yet.
  - `not-applicable`: this category should be omitted from tutor context for the module.
- The rubric is the source of truth. The grading assistant applies it for final/submission review. Tutor settings apply it locally by module.

## Target Model

Add assignment-type-owned grading/rubric fields:

```prisma
model AssignmentType {
  // existing fields...
  scoringScaleJson Json?
  rubricJson Json?
  gradingPromptConfigJson Json?
  gradingOutputSchemaJson Json?
  gradingCalibrationNotes String?
  gradingAssistantVersion Int @default(1)
  gradingAssistantSourceTemplateId String?
  gradingAssistantSourceTemplateSlug String?
}
```

Add module-owned rubric relationship config:

```prisma
model AssignmentModule {
  // existing fields...
  rubricAlignmentJson Json?
}
```

Update grading run audit state so completed runs are explainable after the template tables are removed:

```prisma
model SubmissionGradingAssistantRun {
  // existing fields...
  assignmentTypeId String?
  assignmentTypeGradingVersion Int?
  assignmentTypeRubricSnapshot Json?
  assignmentTypePromptConfigSnapshot Json?
}
```

Remove after the migration and runtime cutover:

- `GradingAssistantTemplate`
- `AssignmentTypeGradingAssistant`
- `gradingAssistantTemplateId` and `templateVersion` dependencies from runtime code
- `/app/admin/grading-assistants*` admin routes
- grading assistant template fixtures/import/export paths

## Execution Plan

### 1. Rename The Admin Surface

- [ ] Add or update a route/UI assertion that the admin navigation shows `Assignments` and does not show `Assignments & Grading`.
- [ ] Update `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin/route.tsx`.
- [ ] Replace the current workflow/grading icon with an assignment-shaped icon, likely `ClipboardList` or `FileText` from `lucide-react`.
- [ ] Keep the existing route path `/app/admin/assignments-grading` for now unless a later routing cleanup is explicitly approved.
- [ ] Run targeted test:

```bash
bun run --cwd services/web-app test
```

- [ ] Commit:

```bash
git add services/web-app/app/routes/app.admin/route.tsx services/web-app/app/routes/**/*.test.tsx
git commit -m "chore: rename admin assignments tab"
```

### 2. Add Pure Config Types And Tests First

- [ ] Create tests for assignment-type-owned rubric parsing and module relationship parsing before implementation.
- [ ] New test file:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/domain/assignment-types/assignment-type-rubric-config.test.ts`
- [ ] New implementation file:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/domain/assignment-types/assignment-type-rubric-config.ts`
- [ ] Export these primitives:

```ts
export const MODULE_RUBRIC_RELATIONSHIPS = [
  "primary",
  "supporting",
  "preparatory",
  "not-applicable",
] as const

export type ModuleRubricRelationship =
  (typeof MODULE_RUBRIC_RELATIONSHIPS)[number]
```

- [ ] Cover these cases:
  - valid rubric JSON parses with categories and criteria intact
  - invalid or missing rubric config falls back to Thesis defaults
  - module alignment preserves only known rubric category IDs
  - unknown relationship values become `not-applicable`
  - categories without an explicit relationship default to `not-applicable`
- [ ] Keep existing grading assistant shared parsing code available temporarily, but move reusable pure parsing into assignment type domain files.
- [ ] Run targeted test:

```bash
bun test services/web-app/app/domain/assignment-types/assignment-type-rubric-config.test.ts
```

- [ ] Commit:

```bash
git add services/web-app/app/domain/assignment-types
git commit -m "test: cover assignment type rubric config"
```

### 3. Add Prisma Migration And Data Copy

- [ ] Update `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/schema.prisma`.
- [ ] Add the new `AssignmentType` and `AssignmentModule` fields.
- [ ] Add grading run audit snapshot fields to `SubmissionGradingAssistantRun`.
- [ ] Generate a migration:

```bash
bun prisma migrate dev --name assignment_type_owned_rubric
```

- [ ] Edit the generated SQL so existing active/default grading assistant links are copied onto their assignment types.
- [ ] Migration copy rule:
  - For each active default `AssignmentTypeGradingAssistant`, copy linked `GradingAssistantTemplate.scoringScale`, `rubricJson`, `promptConfigJson`, `outputSchemaJson`, `calibrationNotes`, `id`, and `slug` onto the linked `AssignmentType`.
  - If an assignment type has no active default link, leave its new rubric fields null so runtime can default to Thesis.
  - If multiple active defaults exist, choose the newest link by `createdAt` and record a warning query in the migration notes.
- [ ] Do not drop old template/link tables in this same migration. First prove runtime and UI have moved.

Pre-migration proof queries:

```sql
SELECT count(*) AS templates FROM "GradingAssistantTemplate";

SELECT count(*) AS active_default_links
FROM "AssignmentTypeGradingAssistant"
WHERE "activeTo" IS NULL AND "isDefault" = true;

SELECT at.id, at.title, gat.slug, gat.version
FROM "AssignmentType" at
JOIN "AssignmentTypeGradingAssistant" link ON link."assignmentTypeId" = at.id
JOIN "GradingAssistantTemplate" gat ON gat.id = link."gradingAssistantTemplateId"
WHERE link."activeTo" IS NULL AND link."isDefault" = true
ORDER BY at.title;
```

Post-migration proof queries:

```sql
SELECT at.id, at.title, at."gradingAssistantSourceTemplateSlug",
       at."rubricJson" IS NOT NULL AS has_rubric,
       at."scoringScaleJson" IS NOT NULL AS has_scoring_scale
FROM "AssignmentType" at
ORDER BY at.title;

SELECT at.id, at.title, jsonb_array_length((at."rubricJson"::jsonb -> 'categories')) AS category_count
FROM "AssignmentType" at
WHERE at."rubricJson" IS NOT NULL
ORDER BY at.title;

SELECT at.id, at.title
FROM "AssignmentType" at
JOIN "AssignmentTypeGradingAssistant" link ON link."assignmentTypeId" = at.id
WHERE link."activeTo" IS NULL
  AND link."isDefault" = true
  AND at."rubricJson" IS NULL;
```

- [ ] Run:

```bash
bun prisma generate
bun run --cwd packages/prisma test
```

- [ ] Commit:

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations packages/prisma/scripts/*.test.ts
git commit -m "feat: store rubric config on assignment types"
```

### 4. Replace Runtime Grading Template Resolution

- [ ] Add tests before implementation:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/domain/assignment-types/assignment-type-grading-config.server.test.ts`
  - update `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`
- [ ] New resolver file:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/domain/assignment-types/assignment-type-grading-config.server.ts`
- [ ] Resolver behavior:
  - Load grading config from `AssignmentType`.
  - If `rubricJson` or scoring config is missing, return Thesis fallback silently.
  - Return a source enum such as `assignment-type` or `thesis-default`.
  - Return an immutable prompt/rubric snapshot suitable for `SubmissionGradingAssistantRun`.
- [ ] Update `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`.
- [ ] Replace all prompt text that says `Grading assistant template:` with assignment-type wording.
- [ ] Persist run metadata against assignment type config:
  - `assignmentTypeId`
  - `assignmentTypeGradingVersion`
  - `assignmentTypeRubricSnapshot`
  - `assignmentTypePromptConfigSnapshot`
  - `metadata.source`
- [ ] Preserve the existing final grading behavior and output schema.
- [ ] Run targeted tests:

```bash
bun test services/web-app/app/domain/assignment-types/assignment-type-grading-config.server.test.ts
bun test services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

- [ ] Commit:

```bash
git add services/web-app/app/domain/assignment-types services/web-app/app/routes/api.domain.grade-essay-ai/route.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
git commit -m "feat: resolve grading config from assignment types"
```

### 5. Update Submission Review Display

- [ ] Add or update tests for dynamic rubric rendering from assignment-type snapshots.
- [ ] Update `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app_.submissions_.$submissionId/route.tsx`.
- [ ] Prefer run snapshots when available so historical grading displays remain stable.
- [ ] Fall back to current assignment type config if no snapshot exists.
- [ ] Fall back to Thesis config if neither exists.
- [ ] Remove UI references to grading assistant template names/slugs.
- [ ] Run:

```bash
bun test services/web-app/app/routes/app_.submissions_.$submissionId/route.test.ts
```

- [ ] Commit:

```bash
git add services/web-app/app/routes/app_.submissions_.$submissionId/route.tsx services/web-app/app/routes/app_.submissions_.$submissionId/route.test.ts
git commit -m "feat: show submission rubrics from assignment type snapshots"
```

### 6. Build Full-Page Assignment Type Create/Edit

- [ ] Add e2e tests first:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/e2e/tests/admin.assignment-types.spec.ts`
- [ ] Required e2e coverage:
  - admin opens Assignments tab
  - admin starts new assignment type and gets a full-page form
  - admin enters title, description, scoring scale, rubric categories, and grading instructions
  - save creates an assignment type with rubric config
  - edit page shows the same values as editable inputs
  - read-only/view surface still shows the configured rubric
- [ ] Add route:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.assignment-types.new/route.tsx`
- [ ] Update edit behavior in:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.assignment-types.$id/route.tsx`
- [ ] Replace the create sheet in:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.assignments-grading._index/route.tsx`
- [ ] Extract reusable admin form pieces from:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/components/admin/grading-assistant-template-form.tsx`
- [ ] New component targets:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/components/admin/assignment-type-editor-form.tsx`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/components/admin/assignment-type-rubric-editor.tsx`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/components/admin/assignment-type-grading-preview.tsx`
- [ ] Page structure:
  - Header: title, status/archive controls, save actions.
  - Section 1: Assignment basics.
  - Section 2: Rubric source of truth.
  - Section 3: Tutor settings.
  - Section 4: Grading assistant preview/settings, mostly inherited/read-only for now.
- [ ] Run:

```bash
bun test services/web-app/app/routes/app.admin.assignments-grading._index/route.test.ts
bun test services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts
bun run --cwd services/web-app test:e2e:smoke
```

- [ ] Commit:

```bash
git add services/web-app/app/routes/app.admin.assignment-types.new services/web-app/app/routes/app.admin.assignment-types.$id services/web-app/app/routes/app.admin.assignments-grading._index services/web-app/app/components/admin services/web-app/e2e/tests/admin.assignment-types.spec.ts
git commit -m "feat: add full page assignment type editor"
```

### 7. Add Module-Level Rubric Relationship UI

- [ ] Add unit tests for module alignment action parsing in:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts`
- [ ] Add e2e coverage that an admin can set relationships for module/category pairs.
- [ ] New component:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/components/admin/module-rubric-alignment-editor.tsx`
- [ ] Update module create/edit flows in:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.assignment-types.$id/route.tsx`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.assignment-types.$id_.modules_.$moduleId/route.tsx`
- [ ] UI behavior:
  - Pull rubric categories from the assignment type.
  - Show each category once per module.
  - Use a segmented control or select for `primary`, `supporting`, `preparatory`, `not-applicable`.
  - Default every unset category to `not-applicable`.
  - Do not show instruction-level controls.
- [ ] Save `rubricAlignmentJson` on `AssignmentModule`.
- [ ] Run:

```bash
bun test services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts
bun run --cwd services/web-app test:e2e:smoke
```

- [ ] Commit:

```bash
git add services/web-app/app/components/admin/module-rubric-alignment-editor.tsx services/web-app/app/routes/app.admin.assignment-types.$id services/web-app/app/routes/app.admin.assignment-types.$id_.modules_.$moduleId services/web-app/e2e/tests/admin.assignment-types.spec.ts
git commit -m "feat: configure module rubric relationships"
```

### 8. Feed Module Relationships Into Tutor Context

- [ ] Add tests before implementation for tutor prompt/context assembly.
- [ ] Likely files:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/api.domain.tutor-response/build-system-prompt.ts`
  - existing or new test beside the tutor-response route.
- [ ] Expected behavior:
  - Include assignment type rubric context only when a module has applicable categories.
  - Include `primary`, `supporting`, and `preparatory` guidance with different wording.
  - Exclude `not-applicable` categories.
  - Keep existing module instructions.
  - Remove assignment-level tutor context usage if any remains.
  - Fall back gracefully when assignment type rubric fields are null.
- [ ] Add an explicit test that the same rubric category text used for grading can be included in tutor context when the module relationship requires it.
- [ ] Run:

```bash
bun test services/web-app/app/routes/api.domain.tutor-response
```

- [ ] Commit:

```bash
git add services/web-app/app/routes/api.domain.tutor-response services/web-app/app/domain/assignment-types
git commit -m "feat: align tutor context with assignment type rubric"
```

### 9. Remove Standalone Grading Assistant Template UI And Runtime Paths

- [ ] Remove admin grading assistant routes:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.grading-assistants._index`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.grading-assistants.new`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/routes/app.admin.grading-assistants.$id`
- [ ] Remove or repurpose:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/components/admin/grading-assistant-template-form.tsx`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/utils/grading-assistant-template-admin.server.ts`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/app/domain/grading/grading-assistant-templates.server.ts`
- [ ] Update assignment type pages so they no longer link or clear grading assistant templates.
- [ ] Update tests:
  - remove `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/e2e/tests/admin.grading-assistants.spec.ts`
  - replace `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/services/web-app/e2e/tests/teacher.grading-assistant-legacy.spec.ts` coverage with assignment-type rubric coverage
  - remove or rewrite route tests for `app.admin.grading-assistants.*`
- [ ] Run:

```bash
bun run --cwd services/web-app test
bun run --cwd services/web-app test:e2e:smoke
```

- [ ] Commit:

```bash
git add services/web-app/app services/web-app/e2e/tests
git commit -m "refactor: remove standalone grading assistant admin"
```

### 10. Update Fixtures, Seed, Import, And Export

- [ ] Update fixtures so assignment type records carry the copied rubric data:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/fixtures/prod-fidelity/assignment-types.json`
- [ ] Remove or stop importing/exporting:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/fixtures/prod-fidelity/grading-assistant-templates.json`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/fixtures/prod-fidelity/assignment-type-grading-assistants.json`
- [ ] Update:
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/scripts/local-dev/import-prod-fidelity-fixtures.ts`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/scripts/local-dev/export-prod-fidelity-fixtures.ts`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/scripts/local-dev/prod-fidelity-types.ts`
  - `/Users/bryantbrock/.codex/worktrees/4cf2/yawp/packages/prisma/scripts/seed-local-dev.test.ts`
- [ ] Run:

```bash
bun run --cwd packages/prisma test
```

- [ ] Commit:

```bash
git add packages/prisma/fixtures packages/prisma/scripts
git commit -m "chore: move grading fixtures onto assignment types"
```

### 11. Drop Old Template Tables In A Final Migration

- [ ] Only do this after runtime, UI, tests, and fixtures no longer reference the old tables.
- [ ] Add final Prisma migration to drop:
  - `AssignmentTypeGradingAssistant`
  - `GradingAssistantTemplate`
  - old `SubmissionGradingAssistantRun.gradingAssistantTemplateId`
  - old `SubmissionGradingAssistantRun.templateVersion`
- [ ] Run a repository search and make it clean:

```bash
rg "GradingAssistantTemplate|AssignmentTypeGradingAssistant|gradingAssistantTemplate|grading-assistants" .
```

- [ ] Allow expected migration history references only.
- [ ] Run:

```bash
bun prisma generate
bun run --cwd services/web-app test
bun run --cwd packages/prisma test
```

- [ ] Commit:

```bash
git add packages/prisma/schema.prisma packages/prisma/migrations services/web-app packages/prisma
git commit -m "refactor: drop grading assistant template model"
```

### 12. End-To-End Verification

- [ ] Use Bryant's existing dev server if it is still running:
  - `http://localhost:5176/`
- [ ] Do not start another dev server on `5176`.
- [ ] Browser QA checklist:
  - admin tab says `Assignments`
  - assignment type create is full page
  - rubric saves and reloads
  - module relationships save and reload
  - tutor module context includes only applicable rubric categories
  - grading assistant output uses assignment type rubric
  - missing/unconfigured assignment type defaults to Thesis grading config without visible warning
  - submission review displays the same rubric categories used during grading
- [ ] Database proof after local migration:

```sql
SELECT title, "gradingAssistantSourceTemplateSlug", "rubricJson" IS NOT NULL AS has_rubric
FROM "AssignmentType"
ORDER BY title;

SELECT title, "rubricAlignmentJson"
FROM "AssignmentModule"
ORDER BY "assignmentTypeId", position;

SELECT "assignmentTypeId", "assignmentTypeRubricSnapshot" IS NOT NULL AS has_snapshot, metadata
FROM "SubmissionGradingAssistantRun"
ORDER BY "createdAt" DESC
LIMIT 10;
```

- [ ] Full verification commands:

```bash
bun run --cwd services/web-app test
bun run --cwd packages/prisma test
bun run --cwd services/web-app typecheck
bun run --cwd services/web-app test:e2e:smoke
```

- [ ] Commit final fixes if any:

```bash
git add .
git commit -m "test: verify assignment type rubric flow"
```

## Recommended Work Order

1. Rename the admin tab first. It is low risk and clarifies the product surface.
2. Land pure config parsing and Prisma fields.
3. Migrate existing grading assistant template data onto assignment types while keeping old tables temporarily.
4. Move runtime grading to assignment type config and add run snapshots.
5. Build the full-page assignment type editor.
6. Add module rubric relationship UI.
7. Wire tutor context to module relationships.
8. Remove old grading assistant template UI and finally drop the old models.

## Risks

- The current grading route is already production-adjacent. Preserve behavior with tests before swapping resolver logic.
- Removing old tables too early would make it harder to prove migration correctness. Keep them until the new runtime and UI are green.
- Module rubric relationships can create overbearing tutor prompts if `supporting` and `preparatory` are worded like grading criteria. Prompt tests should assert relationship-specific wording.
- Submission review must prefer saved run snapshots. Otherwise old grades can appear to change when an admin edits an assignment type rubric later.
- The existing fixture/import/export code can silently reintroduce old template assumptions if not updated in the same sequence.

## Open Product Questions

- Should the assignment type editor expose a "copy rubric from existing assignment type" action in this first pass, or should admins manually recreate/copy text for now?
- Should rubric edits increment `gradingAssistantVersion` automatically on every save, or only when rubric/scoring/prompt fields change?
- In tutor context, should `preparatory` categories include rubric language verbatim, or should they be summarized to avoid the tutor grading unfinished work?
