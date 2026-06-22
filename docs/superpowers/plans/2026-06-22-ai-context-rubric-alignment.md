# AI Context Rubric Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make tutor and grading AI calls auditable and rubric-aligned while removing dead assignment-level tutor context and preserving the Thesis grading assistant fallback.

**Architecture:** Tutor calls will send the current document as an explicit context message instead of an optional tool call, and every AI call will carry source/hash metadata for the content it used. The grading assistant resolver keeps the existing Thesis fallback, while assistant creation can optionally create the default assignment-type link. Module review guidance remains tutor-shaped but is aligned to the canonical thesis rubric categories.

**Tech Stack:** React Router actions/loaders, Bun tests, Prisma models, existing `getLLMCompletion` wrapper, prod-fidelity JSON fixtures.

---

### Task 1: Tutor AI Context Assembly

**Files:**
- Modify: `services/web-app/app/routes/api.domain.tutor-response/build-system-prompt.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/build-system-prompt.test.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.ts`
- Modify: `services/web-app/app/routes/api.domain.tutor-response/route.test.ts`

- [ ] **Step 1: Write failing tests**

Add route assertions that `getLLMCompletion` is called without `tools`, includes a `<student_document_context>` message whose body is the submitted `content`, and metadata records `documentSource: "client-content"`, `documentTextLength`, and `documentTextSha256`.

- [ ] **Step 2: Verify red**

Run: `bun test app/routes/api.domain.tutor-response/build-system-prompt.test.ts app/routes/api.domain.tutor-response/route.test.ts`

Expected: FAIL because the current implementation still sends `read_student_document` as a tool and omits AI context metadata.

- [ ] **Step 3: Implement minimal tutor changes**

Remove `assignmentTutorContext` from the prompt builder. Replace the document tool instruction with an explicit document-context instruction. In the tutor action, select only `document.text`, build one document context user message before the student's response, and pass metadata to `getLLMCompletion`.

- [ ] **Step 4: Verify green**

Run: `bun test app/routes/api.domain.tutor-response/build-system-prompt.test.ts app/routes/api.domain.tutor-response/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: make tutor document context explicit`

### Task 2: Assignment Tutor Context Cleanup

**Files:**
- Modify: `services/web-app/app/components/assignments/assignment-creation-sheet.tsx`
- Modify: `services/web-app/app/components/assignments/assignment-creation-sheet.test.tsx`
- Modify: `services/web-app/app/components/assignments/assignment-edit-sheet.tsx`
- Modify: `services/web-app/app/routes/api.domain.assignment-pdf-extract/route.ts`
- Modify: `services/web-app/app/routes/api.assignments.create/route.ts`
- Modify: `services/web-app/app/routes/api.assignments.create/route.test.ts`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.tsx`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/route.test.ts`
- Modify: `services/web-app/app/routes/app.assignments._index/route.tsx`
- Modify: `services/web-app/app/routes/app.assignments._index/route.test.ts`

- [ ] **Step 1: Write failing tests**

Update tests so legacy and standardized assignment creation ignore submitted `tutorContext`; assignment creation/edit UI never renders a Tutor Context field; PDF extraction returns only `title` and `prompt`.

- [ ] **Step 2: Verify red**

Run: `bun test app/components/assignments/assignment-creation-sheet.test.tsx app/routes/api.assignments.create/route.test.ts app/routes/app.my-classes.$classId/route.test.ts app/routes/app.assignments._index/route.test.ts`

Expected: FAIL where current legacy paths still render and persist `tutorContext`.

- [ ] **Step 3: Implement cleanup**

Remove tutor-context state, props, form controls, PDF extraction response fields, and create/update writes. Keep the nullable database column untouched for backward compatibility.

- [ ] **Step 4: Verify green**

Run: `bun test app/components/assignments/assignment-creation-sheet.test.tsx app/routes/api.assignments.create/route.test.ts app/routes/app.my-classes.$classId/route.test.ts app/routes/app.assignments._index/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `refactor: remove assignment tutor context plumbing`

### Task 3: Grading Assistant Create-Time Linking

**Files:**
- Modify: `services/web-app/app/routes/app.admin.grading-assistants._index/route.tsx`
- Modify: `services/web-app/app/routes/app.admin.grading-assistants._index/route.test.ts`
- Modify: `services/web-app/app/domain/grading/grading-assistant-templates.server.test.ts`

- [ ] **Step 1: Write failing tests**

Add a create action test where `defaultAssignmentTypeId` creates the draft template, expires existing default links for that assignment type, and creates a new default link. Keep the resolver fallback test asserting unlinked types return `legacy-fallback`.

- [ ] **Step 2: Verify red**

Run: `bun test app/routes/app.admin.grading-assistants._index/route.test.ts app/domain/grading/grading-assistant-templates.server.test.ts`

Expected: FAIL because create currently does not link.

- [ ] **Step 3: Implement linking**

Add an optional assignment-type selector to the create form. In `createTemplate`, use a transaction to create the template and, when `defaultAssignmentTypeId` is present, expire existing default links and create a new default link to the new template.

- [ ] **Step 4: Verify green**

Run: `bun test app/routes/app.admin.grading-assistants._index/route.test.ts app/domain/grading/grading-assistant-templates.server.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: link grading assistants during creation`

### Task 4: Grading and Grammar Context Audit Metadata

**Files:**
- Create: `services/web-app/app/utils/ai-context-audit.server.ts`
- Create: `services/web-app/app/utils/ai-context-audit.server.test.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.ts`
- Modify: `services/web-app/app/routes/api.domain.grade-essay-ai/route.test.ts`

- [ ] **Step 1: Write failing tests**

Add helper tests for stable SHA-256 text hashes and source metadata. Add grade-route assertions that grading and grammar LLM calls include `documentSource: "submission-snapshot"`, `submissionId`, `documentId`, content length, and hash.

- [ ] **Step 2: Verify red**

Run: `bun test app/utils/ai-context-audit.server.test.ts app/routes/api.domain.grade-essay-ai/route.test.ts`

Expected: FAIL because the helper does not exist and grading metadata is incomplete.

- [ ] **Step 3: Implement metadata**

Create the helper and thread the audit metadata into AP grading, generic grading, overall-comment fallback, repair, grammar, and grammar retry calls without changing prompt text.

- [ ] **Step 4: Verify green**

Run: `bun test app/utils/ai-context-audit.server.test.ts app/routes/api.domain.grade-essay-ai/route.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `feat: log AI document context audit metadata`

### Task 5: Thesis Module Rubric Alignment

**Files:**
- Modify: `packages/prisma/fixtures/prod-fidelity/assignment-module-instructions.json`
- Modify: `packages/prisma/scripts/seed-local-dev.test.ts`

- [ ] **Step 1: Write failing test**

Add a fixture test that thesis-driven review instructions include the five canonical thesis rubric labels and `Grammar/Syntax/Formatting (10%)`, and no longer present the independent `Content, Organization, Syntax, and Grammar` four-bucket frame.

- [ ] **Step 2: Verify red**

Run: `bun test scripts/seed-local-dev.test.ts`

Expected: FAIL against the existing fixture text.

- [ ] **Step 3: Update fixture text**

Rewrite the thesis-driven and five-paragraph review instruction prompt/tutorInstructions to use rubric-aligned tutor language across Thesis/Content, Organization/Structure, Evidence/Support, Voice/Style, and Grammar/Syntax/Formatting.

- [ ] **Step 4: Verify green**

Run: `bun test scripts/seed-local-dev.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit message: `fix: align thesis module review guidance to rubric`

### Task 6: Full Verification and QA Video

**Files:**
- Modify SDLC run artifacts under `/tmp/yawp-sdlc-ai-context-rubric-20260622-095744`

- [ ] **Step 1: Run focused verification**

Run focused Bun tests from Tasks 1-5, then run `bun test app/routes/api.domain.tutor-response/route.test.ts app/routes/api.domain.grade-essay-ai/route.test.ts app/routes/app.admin.grading-assistants._index/route.test.ts` from `services/web-app` and `bun test scripts/seed-local-dev.test.ts` from `packages/prisma`.

- [ ] **Step 2: Run review**

Run a code-review pass against the implementation diff and address any Critical or Important findings.

- [ ] **Step 3: Capture narrated QA proof**

Start the app, exercise the admin grading assistant create/linking surface and a tutor/grading context proof path using safe local/fixture data, then produce a narrated Sarah MP4 and attach it to the SDLC run proof.

- [ ] **Step 4: Final SDLC validation**

Build the evidence pack and run `python3 /Users/bryantbrock/.codex/skills/codex-sdlc-master/scripts/sdlc_master.py validate-run --run-dir /tmp/yawp-sdlc-ai-context-rubric-20260622-095744`.

Expected: PASS or a documented non-completion stop state with remaining work.
