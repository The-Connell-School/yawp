# Agent Evaluation Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first admin-only Yawp AI evaluation workbench foundation: immutable assignment type AI history plus an admin entry point for tutor/grading testing.

**Architecture:** Add an append-only `AssignmentTypeAiVersion` model and a server helper that snapshots an assignment type's rubric, grading assistant config, modules, instructions, buttons, and module-rubric alignment. Existing runtime flows keep using current tables; history is recorded after admin edits and shown in admin UI.

**Tech Stack:** React Router 7, Bun tests, Prisma/Postgres, existing admin assignment type routes, existing LLM wrapper for later workbench execution.

---

### Task 1: Snapshot Domain Helper

**Files:**
- Create: `services/web-app/app/domain/assignment-types/assignment-type-ai-version.server.ts`
- Create: `services/web-app/app/domain/assignment-types/assignment-type-ai-version.server.test.ts`

- [ ] Write failing tests for deterministic snapshot shape.
- [ ] Implement `buildAssignmentTypeAiSnapshot`.
- [ ] Implement `recordAssignmentTypeAiVersion`.
- [ ] Verify focused Bun test passes.
- [ ] Commit.

### Task 2: Prisma History Model

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260703210000_add_assignment_type_ai_versions/migration.sql`

- [ ] Add `AssignmentTypeAiVersion` with `assignmentTypeId`, `versionNumber`, `changeSource`, `changeSummary`, `snapshotJson`, `createdByUserId`, and indexes.
- [ ] Add relation from `AssignmentType`.
- [ ] Run Prisma generate.
- [ ] Commit schema and generated client changes.

### Task 3: Record History On Admin Assignment Type Edits

**Files:**
- Modify: `services/web-app/app/routes/app.admin.assignment-types.$id/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts`

- [ ] Write failing route test proving `updateCourse` records a version after rubric/grading config edits.
- [ ] Call `recordAssignmentTypeAiVersion` inside the existing transaction after update.
- [ ] Load recent versions in the assignment type loader.
- [ ] Verify focused test passes.
- [ ] Commit.

### Task 4: Record History On Module And Instruction Edits

**Files:**
- Modify: `services/web-app/app/routes/app.admin.assignment-types.$id_.modules_.$moduleId/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.assignment-types.$id_.modules_.$moduleId/route.test.ts`

- [ ] Write failing tests for module update and instruction update recording.
- [ ] Record versions for module update/delete, instruction create/update/delete, and instruction reorder.
- [ ] Verify focused test passes.
- [ ] Commit.

### Task 5: Admin Version History UI

**Files:**
- Modify: `services/web-app/app/components/admin/assignment-type-editor-form.tsx`
- Create: `services/web-app/app/components/admin/assignment-type-ai-history-section.tsx`
- Modify: `services/web-app/e2e/tests/admin.assignment-types.spec.ts`

- [ ] Add typed history rows to editor props.
- [ ] Render latest versions with version number, change summary, timestamp, and workbench link.
- [ ] Add an E2E assertion for visible history/workbench UI.
- [ ] Verify focused UI/unit/e2e tests as available.
- [ ] Commit.

### Task 6: Admin Workbench Route

**Files:**
- Create: `services/web-app/app/routes/app.admin.assignment-types.$id_.ai-workbench/route.tsx`
- Create: `services/web-app/app/routes/app.admin.assignment-types.$id_.ai-workbench/route.test.ts`

- [ ] Write loader test for admin-only assignment type AI context loading.
- [ ] Implement route showing selected assignment type, latest version, modules, rubric categories, and two forms: tutor test case and grading test case.
- [ ] Keep actions deterministic under E2E fixture mode.
- [ ] Verify focused tests pass.
- [ ] Commit.

### Task 7: Verification

**Commands:**
- `bun test services/web-app/app/domain/assignment-types/assignment-type-ai-version.server.test.ts`
- `bun test services/web-app/app/routes/app.admin.assignment-types.$id/route.test.ts`
- `bun test services/web-app/app/routes/app.admin.assignment-types.$id_.modules_.$moduleId/route.test.ts`
- `bun run --cwd services/web-app typecheck`
- `git diff --check`

- [ ] Run all commands fresh.
- [ ] Fix failures.
- [ ] Capture final status and remaining risks.

