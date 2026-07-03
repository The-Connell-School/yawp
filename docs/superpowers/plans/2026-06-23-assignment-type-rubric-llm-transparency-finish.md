# Assignment Type Rubric And LLM Transparency Finish Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the assignment-type-owned rubric/tutor/grading model, remove the old grading assistant template and assignment-level tutor context concepts, and add reliable visibility into the exact document/context sent to Anthropic for tutor and grading flows.

**Architecture:** `AssignmentType` is the source of truth for rubric, scoring scale, grading instructions, and tutor architecture. `AssignmentModule.rubricAlignmentJson` maps rubric categories to module-level relationships using `primary`, `supporting`, `preparatory`, or `not-applicable`. All AI calls go through `getLLMCompletion`, and each call records a normalized context snapshot in `LlmLog.metadata` so admins can audit source document text, prompt inputs, hashes, and feature-specific rubric/module data.

**Tech Stack:** React Router route modules, Prisma/Postgres, Bun/Vitest, Playwright, existing `LlmLog` table, Anthropic SDK wrapper in `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`.

---

## Current State

- [x] Admin tab label is now `Assignments`.
- [x] Assignment types have rubric/scoring/grading fields and module rubric alignment storage.
- [x] Existing grading assistant template data is copied onto assignment types by the first migration.
- [x] Grading evaluation resolves assignment type config and silently falls back to Thesis when an assignment type has no rubric.
- [x] Submission review prefers grading-run rubric snapshots.
- [x] Tutor prompts can include module-level rubric guidance.
- [x] Assignment type create/edit has moved toward a full-page editor.
- [ ] Standalone grading assistant template files are partly deleted but not fully removed from Prisma schema, fixtures, seed, and import/export scripts.
- [ ] Assignment-level `tutorContext` still exists in schema, assignment create/edit surfaces, tests, and e2e helpers.
- [ ] `LlmLog` stores raw prompts/messages, but there is no normalized, searchable audit shape for "which document value did Anthropic receive?"

## Product Shape To Preserve

- An assignment type is the assignment base/preset/template.
- Each assignment type owns one rubric.
- The rubric is the source of truth for both final grading and tutor-module guidance.
- Tutor module relationships are module-level only:
  - `primary`: directly teaches, practices, or reviews the rubric category.
  - `supporting`: uses the category as a secondary lens.
  - `preparatory`: builds toward the category without evaluating final mastery.
  - `not-applicable`: omits that category from module tutor context.
- Teachers may configure assignment prompt, grading strictness, and whether grading is enabled; teachers do not own rubric or grading mechanics in this release.
- Unconfigured or unlinked assignment types default silently to Thesis grading config.

## Task 1: Finish Removing Standalone Grading Assistant Templates

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260623140000_drop_grading_assistant_templates/migration.sql`
- Modify: `services/web-app/e2e/seed-e2e.ts`
- Modify: `services/web-app/package.json`
- Modify: `packages/prisma/scripts/local-dev/import-prod-fidelity-fixtures.ts`
- Modify: `packages/prisma/scripts/local-dev/export-prod-fidelity-fixtures.ts`
- Modify: `packages/prisma/scripts/local-dev/prod-fidelity-types.ts`
- Modify: `packages/prisma/scripts/seed-local-dev.test.ts`
- Modify: `packages/prisma/fixtures/prod-fidelity/manifest.json`
- Delete: `packages/prisma/fixtures/prod-fidelity/grading-assistant-templates.json`
- Delete: `packages/prisma/fixtures/prod-fidelity/assignment-type-grading-assistants.json`

- [ ] **Step 1: Run the reference search**

```bash
rg -n "GradingAssistantTemplate|AssignmentTypeGradingAssistant|gradingAssistantTemplate|grading-assistants|gradingAssistantLinks|gradingAssistantTemplateId|templateVersion" services/web-app/app services/web-app/e2e services/web-app/package.json packages/prisma/schema.prisma packages/prisma/scripts packages/prisma/fixtures --glob '!**/build/**' --glob '!**/generated/**'
```

Expected: only the known schema, fixture, seed, import/export, and already-deleted route references remain.

- [ ] **Step 2: Update schema and migration**

Remove these from `packages/prisma/schema.prisma`:
- `AssignmentType.gradingAssistantLinks`
- `OrgMembership.gradingAssistantTemplatesCreated`
- `OrgMembership.gradingAssistantTemplatesUpdated`
- `GradingAssistantTemplate`
- `AssignmentTypeGradingAssistant`
- `SubmissionGradingAssistantRun.gradingAssistantTemplateId`
- `SubmissionGradingAssistantRun.gradingAssistantTemplate`
- `SubmissionGradingAssistantRun.templateVersion`
- `@@index([gradingAssistantTemplateId])`

Migration SQL:

```sql
BEGIN;

ALTER TABLE "SubmissionGradingAssistantRun"
  DROP CONSTRAINT IF EXISTS "SubmissionGradingAssistantRun_gradingAssistantTemplateId_fkey";

DROP INDEX IF EXISTS "SubmissionGradingAssistantRun_gradingAssistantTemplateId_idx";

ALTER TABLE "SubmissionGradingAssistantRun"
  DROP COLUMN IF EXISTS "gradingAssistantTemplateId",
  DROP COLUMN IF EXISTS "templateVersion";

DROP TABLE IF EXISTS "AssignmentTypeGradingAssistant";
DROP TABLE IF EXISTS "GradingAssistantTemplate";

COMMIT;
```

- [ ] **Step 3: Move seed and fixture data onto assignment types**

In `services/web-app/e2e/seed-e2e.ts`, stop creating `gradingAssistantTemplate` rows. Seed assignment types with `scoringScaleJson`, `rubricJson`, `gradingPromptConfigJson`, `gradingOutputSchemaJson`, and `gradingAssistantVersion`.

In prod-fidelity import/export scripts, remove grading-template bundle keys and keep the copied rubric fields on `assignment-types.json`.

- [ ] **Step 4: Verify**

```bash
bun prisma format
bun prisma generate
bun prisma migrate deploy
bun test ./packages/prisma/scripts/seed-local-dev.test.ts
bun test services/web-app/app/routes/app.admin.assignments-grading._index/route.test.ts 'services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts'
```

Database proof:

```sql
SELECT to_regclass('"GradingAssistantTemplate"') AS grading_template_table;
SELECT to_regclass('"AssignmentTypeGradingAssistant"') AS assignment_type_link_table;
SELECT column_name
FROM information_schema.columns
WHERE table_name = 'SubmissionGradingAssistantRun'
  AND column_name IN ('gradingAssistantTemplateId', 'templateVersion', 'assignmentTypeId', 'assignmentTypeRubricSnapshot');
```

Expected: old tables are null, old columns are absent, assignment-type snapshot columns remain.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma services/web-app
git commit -m "refactor: remove standalone grading assistant templates"
```

## Task 2: Remove Assignment-Level Tutor Context

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260623141000_drop_assignment_tutor_context/migration.sql`
- Modify: `services/web-app/app/routes/api.assignments.create/route.ts`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`
- Modify: `services/web-app/app/routes/app.assignments._index/route.tsx`
- Modify: `services/web-app/app/components/assignments/assignment-creation-sheet.tsx`
- Modify: `services/web-app/app/components/assignments/assignment-edit-sheet.tsx`
- Modify: `services/web-app/e2e/db-helpers.ts`
- Modify tests that currently select or assert `tutorContext`.

- [ ] **Step 1: Write tests that prove teacher-authored tutor context is gone**

Update route tests so assignment creation and assignment edit ignore any posted `tutorContext` field and never select or return it.

Run:

```bash
bun test services/web-app/app/routes/api.assignments.create/route.test.ts 'services/web-app/app/routes/app.my-classes.$classId/route.test.ts' services/web-app/app/routes/app.assignments._index/route.test.ts
```

Expected before implementation: failures on stale `tutorContext` selectors/returns.

- [ ] **Step 2: Remove runtime/UI usage**

Remove `tutorContext` from form props, component state, Prisma selects, Prisma creates/updates, loader data, and e2e helpers. Preserve assignment prompt and assignment type module instructions as the only tutor context sources.

- [ ] **Step 3: Drop the database column**

Migration SQL:

```sql
BEGIN;

ALTER TABLE "Assignment"
  DROP COLUMN IF EXISTS "tutorContext";

COMMIT;
```

- [ ] **Step 4: Verify**

```bash
bun prisma format
bun prisma generate
bun prisma migrate deploy
rg -n "tutorContext" services/web-app/app services/web-app/e2e packages/prisma/schema.prisma --glob '!**/build/**' --glob '!**/generated/**'
bun test services/web-app/app/routes/api.assignments.create/route.test.ts 'services/web-app/app/routes/app.my-classes.$classId/route.test.ts' services/web-app/app/routes/app.assignments._index/route.test.ts
```

Expected: no runtime `tutorContext` references remain. If historical migration files contain the term, leave them alone.

- [ ] **Step 5: Commit**

```bash
git add packages/prisma services/web-app
git commit -m "refactor: remove assignment tutor context"
```

## Task 3: Rename Shared Rubric Utilities Away From Template Terminology

**Files:**
- Move: `services/web-app/app/utils/grading-assistant-template.shared.ts` to `services/web-app/app/domain/assignment-types/assignment-type-rubric.shared.ts`
- Modify: imports in grading, tutor, submission review, and assignment type routes.

- [ ] **Step 1: Search current imports**

```bash
rg -n "grading-assistant-template.shared|GradingAssistantTemplate|grading assistant template" services/web-app/app --glob '!**/build/**'
```

- [ ] **Step 2: Move the utility and update naming**

Keep the pure parsing behavior stable. Rename exported types/functions only where the old names imply the deleted standalone template concept.

- [ ] **Step 3: Verify grammar weight and Thesis fallback**

Run:

```bash
bun test services/web-app/app/domain/assignment-types/assignment-type-rubric-config.test.ts services/web-app/app/domain/assignment-types/assignment-type-grading-config.server.test.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

Expected: Thesis default still includes grammar/mechanics at `0.1`.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/app
git commit -m "refactor: rename rubric config utilities"
```

## Task 4: Add Normalized LLM Context Snapshots

**Files:**
- Modify: `services/web-app/app/utils/ai-context-audit.server.ts`
- Modify: `services/web-app/app/utils/getLLMCompletion/getLLMCompletion.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Modify tests beside those files.

- [ ] **Step 1: Add tests for metadata shape before implementation**

Tests should assert each AI call passes metadata with:
- `feature`
- `kind`
- `documentSource`
- `documentId`
- `submissionId`
- `documentTextLength`
- `documentTextSha256`
- `assignmentTypeId`
- `assignmentTypeRubricSource`
- `assignmentTypeGradingVersion`
- `rubricCategoryKeys`
- `moduleRubricRelationships` for tutor calls

Run:

```bash
bun test services/web-app/app/routes/api.domain.tutor-response/route.test.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

Expected before implementation: missing metadata assertions fail where not already present.

- [ ] **Step 2: Normalize metadata construction**

Extend `buildAiTextContextAudit` into a small builder that returns stable, JSON-safe context metadata. Keep raw full text in `LlmLog.messages`, but make `metadata` the searchable summary.

For grading:
- Main grading call: document source is `submission-snapshot` when `submissionId` is present and `db-document-text` when grading a live document.
- Overall-comment repair call: reuse the same document audit.
- Grammar issue calls: reuse the same document audit and add `kind: "grammar-issues"`.

For tutor:
- Use `client-content` when the browser submitted current editor text.
- Use `db-document-text` only when client content is absent.
- Include module id, instruction id, alignment keys, and rubric category keys.

- [ ] **Step 3: Keep exact Anthropic payload auditable**

`getLLMCompletion` should continue logging the exact `system` and `messages` passed to Anthropic after tab normalization. Add metadata fields:
- `messageCount`
- `messageTextLengths`
- `hasTools`
- `toolRoundCount` when tools are used

Do not replace full messages with hashes; the current product debugging need is exact payload visibility.

- [ ] **Step 4: Verify**

```bash
bun test services/web-app/app/utils/getLLMCompletion/getLLMCompletion.test.ts services/web-app/app/routes/api.domain.tutor-response/route.test.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
```

If `getLLMCompletion` lacks a test file, create one that mocks `anthropic.messages.create` and `prisma.llmLog.create`.

- [ ] **Step 5: Commit**

```bash
git add services/web-app/app
git commit -m "feat: add ai context audit metadata"
```

## Task 5: Add Admin Visibility For LLM Context Logs

**Files:**
- Modify: `services/web-app/app/routes/app.admin.audit/route.tsx`
- Add or modify route tests for admin audit.

- [ ] **Step 1: Add tests for LLM log visibility**

Test that admin audit can show recent `LlmLog` rows filtered by document id, submission id, feature, and kind.

- [ ] **Step 2: Add an AI logs panel**

In `app.admin.audit`, keep document write journal as-is and add a second section for AI context logs. Display:
- created at
- feature/kind
- provider/model
- document source
- document id/submission id
- text length/hash
- assignment type id/version/source
- expandable exact system/messages/response/error

- [ ] **Step 3: Verify**

```bash
bun test services/web-app/app/routes/app.admin.audit/route.test.ts
```

If no audit route test exists, create one with mocked Prisma calls for both document write journals and LLM logs.

- [ ] **Step 4: Commit**

```bash
git add services/web-app/app/routes/app.admin.audit
git commit -m "feat: show ai context logs in admin audit"
```

## Task 6: Complete Assignment Type Editor UX

**Files:**
- Modify: `services/web-app/app/routes/app.admin.assignments-grading._index/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.assignment-types.new/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.assignment-types.$id/route.tsx`
- Modify: `services/web-app/app/components/admin/assignment-type-editor-form.tsx`
- Modify: `services/web-app/app/components/admin/rubric-config-editors.tsx`
- Modify: `services/web-app/app/components/admin/module-rubric-alignment-editor.tsx`
- Add/update: `services/web-app/e2e/tests/admin.assignment-types.spec.ts`

- [ ] **Step 1: Add e2e expectations first**

Cover:
- admin opens `Assignments`
- create assignment type is a full page
- rubric categories save and reload
- module relationship values save and reload
- grading assistant section is inherited/read-only or empty state, not a standalone template chooser

- [ ] **Step 2: Polish copy and remove old terminology**

Replace visible "grading assistant template" language with assignment type / rubric / grading assistant application language.

- [ ] **Step 3: Verify**

```bash
bun run --cwd services/web-app test:e2e:smoke
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app
git commit -m "test: cover assignment type rubric admin flow"
```

## Task 7: Final Verification And QA Video

**Files:**
- No product files unless verification finds defects.

- [ ] **Step 1: Full test pass**

```bash
bun run --cwd services/web-app typecheck
bun test services/web-app/app/routes/api.domain.tutor-response/route.test.ts services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts
bun test services/web-app/app/domain/assignment-types/assignment-type-rubric-config.test.ts services/web-app/app/domain/assignment-types/assignment-type-grading-config.server.test.ts
bun test ./packages/prisma/scripts/seed-local-dev.test.ts
bun run --cwd services/web-app test:e2e:smoke
```

- [ ] **Step 2: Database proof queries**

```sql
SELECT title, "gradingAssistantSourceTemplateSlug", "rubricJson" IS NOT NULL AS has_rubric
FROM "AssignmentType"
ORDER BY title;

SELECT title, "rubricAlignmentJson"
FROM "AssignmentModule"
ORDER BY "assignmentTypeId", position;

SELECT model, provider, metadata
FROM "LlmLog"
ORDER BY "createdAt" DESC
LIMIT 10;
```

- [ ] **Step 3: Browser QA**

Use the existing dev server at `http://localhost:5176/` if it is still running. Do not start another server on port `5176`.

Exercise:
- admin assignment type create/edit
- module rubric relationship edit
- tutor response with client document content
- grading assistant response with submission snapshot
- admin audit AI log review

- [ ] **Step 4: Capture narrated QA video**

Use the repository QA video scripts if available:

```bash
node scripts/capture_browser_qa.mjs --url http://localhost:5176/
node scripts/narrate_qa_video.mjs
node scripts/publish_qa_video.mjs
```

If script arguments differ, inspect the scripts and use the supported flags.

- [ ] **Step 5: Final commit for verification fixes only**

```bash
git status --short
git add <only-files-fixed-during-verification>
git commit -m "test: verify assignment type rubric flow"
```

## Recommended Execution Order

1. Finish deleting old grading assistant template schema/fixtures/import-export while preserving copied assignment type data.
2. Remove assignment-level `tutorContext` completely.
3. Rename shared rubric utilities so the code language matches the product model.
4. Add normalized LLM context metadata while keeping exact raw messages in `LlmLog`.
5. Add admin visibility for AI logs.
6. Finish admin editor/e2e polish.
7. Run migrations, focused tests, e2e, database proof, and narrated QA video.

## Risks

- Dropping template tables before fixture/import/export cleanup will break local seed and e2e setup.
- Removing `tutorContext` must not remove assignment prompt or module tutor instructions; those are still valid context sources.
- Exact prompt logging contains student writing. Keep it admin-only and do not expose it outside existing admin audit surfaces.
- Tutor module rubric guidance can become too grading-like if `preparatory` or `supporting` copy is too strong. Tests should assert relationship-specific language.
- Historical grading display must keep preferring saved run snapshots so rubric edits do not rewrite old grades.

## Open Questions For Bryant

- Should admins get a "copy rubric from another assignment type" action in this first release, or should that wait until after the core model lands?
- Should the AI audit UI expose full raw prompts inline to admins, or require an explicit expand/copy action because student text is sensitive?
