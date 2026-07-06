# AI Workbench Real Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the embedded admin AI workbench UI with sandbox launches into the existing document and submission pages.

**Architecture:** Add sandbox provenance to real `Document` and `Submission` records, create those records from the admin assignment-type workbench, and redirect admins into `/app/documents/:id` or `/app/submissions/:submissionId?edit=1`. The real app pages get a small sandbox banner and normal app lists exclude sandbox records.

**Tech Stack:** React Router loaders/actions, Prisma/Postgres, Bun tests, Playwright e2e.

---

### Task 1: Sandbox Schema And Launch Helper

**Files:**
- Modify: `packages/prisma/schema.prisma`
- Create: `packages/prisma/migrations/20260706180000_add_ai_sandbox_records/migration.sql`
- Modify: `services/web-app/app/domain/documents.server.ts`
- Create: `services/web-app/app/domain/assignment-types/assignment-type-ai-sandbox.server.ts`
- Test: `services/web-app/app/domain/documents.server.test.ts`

- [ ] Add `Document.isAiSandbox`, `Document.aiSandboxRunId`, `Submission.isAiSandbox`, and `Submission.aiSandboxRunId`.
- [ ] Extend `createDocumentForAssignmentType` with optional initial title/text/html and sandbox run id.
- [ ] Add `createAssignmentTypeAiSandboxLaunch` that creates an `AssignmentTypeAiEvaluationRun`, sandbox document, and optional sandbox submission in one transaction-safe sequence.
- [ ] Run domain tests and regenerate Prisma client.

### Task 2: Admin Launcher Route

**Files:**
- Modify: `services/web-app/app/routes/app.admin.assignment-types.$id_.ai-workbench/route.tsx`
- Test: `services/web-app/app/routes/app.admin.assignment-types.$id_.ai-workbench/route.test.ts`
- Test: `services/web-app/e2e/tests/admin.assignment-types.spec.ts`

- [ ] Add failing route tests for `launchTutorSandbox` and `launchGradingSandbox`.
- [ ] Replace the embedded tutor/grading panes with a compact launcher form and history links.
- [ ] Redirect tutor launches to `/app/documents/:documentId?aiWorkbenchRunId=:runId&exitTo=...`.
- [ ] Redirect grading launches to `/app/submissions/:submissionId?edit=1&aiWorkbenchRunId=:runId&exitTo=...`.

### Task 3: Real Page Sandbox Treatment

**Files:**
- Modify: `services/web-app/app/routes/app_.documents_.$id/route.tsx`
- Modify: `services/web-app/app/routes/app_.submissions_.$submissionId/route.tsx`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Test: `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`

- [ ] Select sandbox fields in document/submission loaders.
- [ ] Add a small sandbox banner with an exit link on both real pages.
- [ ] Treat admin-owned sandbox submissions as gradeable in the submission page and grading API.
- [ ] Keep the own-document grading block for all non-sandbox documents.

### Task 4: Hide Sandbox Records From Normal Workflows

**Files:**
- Modify: document/submission list loaders in `services/web-app/app/routes/app._index/route.tsx`, `app.documents._index/route.tsx`, `app.assignment-types.$id/route.tsx`, `app.my-classes.$classId/route.tsx`, and `app.my-classes.$classId_.assignments.$assignmentId/route.tsx`
- Test: existing route tests for those loaders where present

- [ ] Add `isAiSandbox: false` to normal list queries.
- [ ] Keep explicit document/submission routes openable by id.

### Task 5: Verification

- [ ] Run focused unit tests for the launcher, documents helper, grading API, and affected list routes.
- [ ] Run `bun run --cwd services/web-app typecheck`.
- [ ] Run `./node_modules/.bin/playwright test e2e/tests/admin.assignment-types.spec.ts --project=chromium`.
- [ ] Smoke real document and submission sandbox pages in desktop and mobile browser viewports.
