# E2E Test Suite Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the e2e test suite trustworthy by deleting dead infrastructure, building a comprehensive seed, and cleaning every test file.

**Architecture:** Delete the dead e2e Prisma schema. Remove the broken production-dump path from prepare-e2e. Build a rich seed with 4 documents in different lifecycle states. Standardize all test files to use a single editor selector, condition-based waits, and shared fixtures.

**Tech Stack:** Playwright, Prisma (production schema at `packages/prisma`), bun:test

**Spec:** `docs/superpowers/specs/2026-04-09-e2e-overhaul-design.md`

**Conventions:**
- Run tests with `cd services/web-app && bun run test:e2e:smoke` (smoke) or `bun run test:e2e:full` (all)
- The e2e Prisma client is created via `e2e/prisma-client.ts` which loads from `packages/prisma/generated/prisma`
- All test files import `{ test, expect }` from `../test-setup`
- Use `bun:test` for unit tests, Playwright for e2e

---

### Task 1: Delete dead e2e schema and simplify prepare-e2e.ts

**Files:**
- Delete: `services/web-app/e2e/prisma/schema.prisma` (entire `e2e/prisma/` directory)
- Modify: `services/web-app/e2e/prepare-e2e.ts`

- [ ] **Step 1: Delete the dead e2e/prisma directory**

```bash
rm -rf services/web-app/e2e/prisma
```

- [ ] **Step 2: Simplify prepare-e2e.ts — remove the production dump path**

Remove: `downloadDump()`, `restoreDump()`, the `DUMP_S3_URI` constant, the try/catch block around S3 download, the `usedProductionDump` flag, the `seed-overlay.ts` call, and the conditional branch. The simplified `prepareE2E()` function becomes:

```ts
export async function prepareE2E() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const rootDir = path.resolve(__dirname, '../../..');
  const prismaDir = path.join(rootDir, 'packages/prisma');
  const e2eDir = path.join(rootDir, 'services/web-app/e2e');
  const ctxPath = path.join(e2eDir, '.e2e-context.json');

  // 1. Prepare Postgres connection
  const { databaseUrl, startedContainer } = await prepareConnection(e2eDir);

  // 2. Drop and recreate database for clean state
  await resetDatabase(databaseUrl);
  writeE2EEnv(e2eDir, databaseUrl);

  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // 3. Generate Prisma client + run migrations from production schema
  run('bun prisma generate', { cwd: prismaDir, env });
  run('bun prisma migrate deploy', { cwd: prismaDir, env });

  // 4. Seed deterministic test data
  const { seedE2E } = await import('./seed-e2e');
  const context = await seedE2E();
  fs.writeFileSync(ctxPath, JSON.stringify(context, null, 2));

  // eslint-disable-next-line no-console
  console.log('E2E prepare complete', {
    DATABASE_URL: databaseUrl,
    DOCKER_PG_STARTED: startedContainer,
  });
}
```

Keep all the utility functions that are still used: `run()`, `shellEscape()`, `dockerAvailable()`, `containerRunning()`, `startDockerPostgres()`, `waitForDockerPostgresReady()`, `resetDatabase()`, `prepareConnection()`, `writeE2EEnv()`.

Delete: `downloadDump()`, `restoreDump()`, `DUMP_S3_URI` constant.

- [ ] **Step 3: Verify the prepare script still works**

```bash
cd services/web-app && bun ./e2e/ensure-e2e-env.ts
```

Expected: completes without error, writes `.e2e-context.json` and `.env.e2e`.

- [ ] **Step 4: Commit**

```bash
git add -A services/web-app/e2e/prisma services/web-app/e2e/prepare-e2e.ts
git commit -m "chore: delete dead e2e schema, remove broken production dump path from prepare-e2e"
```

---

### Task 2: Rewrite seed-e2e.ts with comprehensive seed data

**Files:**
- Modify: `services/web-app/e2e/seed-e2e.ts`

**Context:** The current seed creates 1 document. The new seed creates 4 documents in distinct lifecycle states (fresh, edited with revisions, submitted with snapshot, graded with grade + comments), plus feature flag settings. All using the production Prisma schema.

- [ ] **Step 1: Rewrite seed-e2e.ts**

The new `E2EContext` type and `seedE2E()` function. Keep the existing `createPassword()` and `cleanupDb()` helpers. The key additions:

```ts
export type E2EContext = {
  organizationId: string;
  schoolId: string;
  classId: string;
  classCode: string;
  // Users
  userId: string;
  userEmail: string;
  adminUserId: string;
  adminEmail: string;
  profileId: string;
  teacherUserId: string;
  teacherProfileId: string;
  teacherName: string;
  teacherEmail: string;
  // Content
  studentCourseId: string;
  freshDocumentId: string;
  editedDocumentId: string;
  submittedDocumentId: string;
  gradedDocumentId: string;
  snapshotId: string;
  gradeId: string;
};
```

After the existing org/school/class/user creation, add 4 documents:

1. **Fresh document** — minimal content, no revisions:
   ```ts
   const freshDoc = await prisma.document.create({
     data: {
       title: 'Fresh Document',
       text: '',
       html: '<p></p>',
       profileId: profile.id,
       classId: seededClass.id,
     },
   });
   ```

2. **Edited document** — has content + 2 revisions:
   ```ts
   const editedDoc = await prisma.document.create({
     data: {
       title: 'Edited Document',
       text: 'This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.',
       html: '<p>This are a practice essay with grammar mistake. I went to the store, I buyed milk and bread. The students was excited for writing.</p>',
       revision: 2,
       profileId: profile.id,
       classId: seededClass.id,
     },
   });
   await prisma.documentRevision.createMany({
     data: [
       { documentId: editedDoc.id, html: '<p></p>', text: '', trigger: 'session-start' },
       { documentId: editedDoc.id, html: editedDoc.html!, text: editedDoc.text!, trigger: 'auto' },
     ],
   });
   ```

3. **Submitted document** — has snapshot, `submittedAt` set:
   ```ts
   const submittedText = 'The importance of reading cannot be overstated. Reading expands our vocabulary and improves comprehension skills.';
   const submittedHtml = `<p>${submittedText}</p>`;
   const now = new Date();
   const snapshot = await prisma.documentSnapshot.create({
     data: {
       html: submittedHtml,
       text: submittedText,
       title: 'Submitted Document',
       documentId: 'placeholder', // will be set below
       submittedAt: now,
     },
   });
   // Fix: create doc first, then snapshot, then link
   const submittedDoc = await prisma.document.create({
     data: {
       title: 'Submitted Document',
       text: submittedText,
       html: submittedHtml,
       revision: 3,
       submittedAt: now,
       profileId: profile.id,
       classId: seededClass.id,
     },
   });
   const submittedSnapshot = await prisma.documentSnapshot.create({
     data: {
       html: submittedHtml,
       text: submittedText,
       title: 'Submitted Document',
       documentId: submittedDoc.id,
       submittedAt: now,
     },
   });
   await prisma.document.update({
     where: { id: submittedDoc.id },
     data: { submittedSnapshotId: submittedSnapshot.id },
   });
   ```

4. **Graded document** — has snapshot + grade (77%, released) + 2 grade comments:
   ```ts
   const gradedText = 'Education is the foundation of society. Through learning, students develop critical thinking skills that serve them throughout life.';
   const gradedHtml = `<p>${gradedText}</p>`;
   const gradedDoc = await prisma.document.create({
     data: {
       title: 'Graded Document',
       text: gradedText,
       html: gradedHtml,
       revision: 4,
       submittedAt: now,
       profileId: profile.id,
       classId: seededClass.id,
     },
   });
   const gradedSnapshot = await prisma.documentSnapshot.create({
     data: {
       html: gradedHtml,
       text: gradedText,
       title: 'Graded Document',
       documentId: gradedDoc.id,
       submittedAt: now,
     },
   });
   await prisma.document.update({
     where: { id: gradedDoc.id },
     data: { submittedSnapshotId: gradedSnapshot.id },
   });
   const teacherProfile = await prisma.profile.findFirstOrThrow({
     where: { userId: seededTeacher.id },
   });
   const grade = await prisma.grade.create({
     data: {
       documentId: gradedDoc.id,
       snapshotId: gradedSnapshot.id,
       gradedById: teacherProfile.id,
       numericPercentage: 77,
       letterGrade: 'C+',
       overallScore: 4,
       overallComment: 'Good effort with room for improvement.',
       essayText: gradedText,
       essayHtml: gradedHtml,
       rubricScores: {
         thesis_and_content: 5,
         organization_and_structure: 1,
         evidence_and_support: 5,
         voice_and_style: 1,
         grammar_and_mechanics: 1,
       },
       releasedAt: now,
     },
   });
   await prisma.gradeComment.createMany({
     data: [
       { gradeId: grade.id, profileId: teacherProfile.id, content: 'Strong thesis statement.', excerpt: 'Education is the foundation', occurrence: 1 },
       { gradeId: grade.id, profileId: teacherProfile.id, content: 'Needs more supporting evidence.', excerpt: 'critical thinking skills', occurrence: 1 },
     ],
   });
   ```

5. **Feature flag settings** — enable submission + assignments by default:
   ```ts
   await prisma.setting.createMany({
     data: [
       { name: 'document_submission_enabled', value: 'true', valueType: 'boolean', description: 'Allow students to submit documents for grading' },
       { name: 'document_submission_enabled_school_ids', value: school.id, valueType: 'string', description: 'School IDs allowed to use document submission' },
       { name: 'assignments_enabled_org_ids', value: org.id, valueType: 'string', description: 'Organization IDs allowed to use assignments' },
     ],
   });
   ```

6. **Link ONLY the edited doc to module session** (keeping the existing pattern but using the edited doc):
   ```ts
   await prisma.studentCourseModuleSession.create({
     data: {
       studentCourseModuleId: studentCourse.studentCourseModules.sort((a, b) => a.position - b.position)[0].id,
       studentProfileId: studentProfile.id,
       documentId: editedDoc.id,
       title: 'E2E Doc Session',
       instructionsCompleted: 0,
     },
   });
   ```

7. **Return expanded context:**
   ```ts
   return {
     organizationId: org.id,
     schoolId: school.id,
     classId: seededClass.id,
     classCode,
     userId: user.id,
     userEmail: user.email,
     adminUserId: adminUser.id,
     adminEmail: adminUser.email,
     profileId: profile.id,
     teacherUserId: seededTeacher.id,
     teacherProfileId: seededTeacherProfileId,
     teacherName: seededTeacherName,
     teacherEmail: seededTeacherEmail,
     studentCourseId: studentCourse.id,
     freshDocumentId: freshDoc.id,
     editedDocumentId: editedDoc.id,
     submittedDocumentId: submittedDoc.id,
     gradedDocumentId: gradedDoc.id,
     snapshotId: submittedSnapshot.id,
     gradeId: grade.id,
   };
   ```

- [ ] **Step 2: Verify seed runs without errors**

```bash
cd services/web-app && bun ./e2e/ensure-e2e-env.ts
```

Check `.e2e-context.json` has all new fields.

- [ ] **Step 3: Commit**

```bash
git add services/web-app/e2e/seed-e2e.ts
git commit -m "feat: comprehensive e2e seed with 4 document lifecycle states"
```

---

### Task 3: Rewrite test-helpers.ts and test-setup.ts

**Files:**
- Modify: `services/web-app/e2e/test-helpers.ts`
- Modify: `services/web-app/e2e/test-setup.ts`

- [ ] **Step 1: Rewrite test-helpers.ts**

Delete `mockAuthentication()` and `navigateToDocument()` (never used). Add `EDITOR_SELECTOR` constant. Add `openDocument()`, `waitForSaved()`, `verifyPersistsOnReload()`. Remove `waitForTimeout` from `waitForEditorReady()` and `verifySavedData()`. Keep working methods (`typeInEditor`, `pasteInEditor`, `clearEditor`, `getEditorContent`, `clickExitIfPresent`, etc.) but update their selectors to use `EDITOR_SELECTOR`.

```ts
import { Page, expect } from '@playwright/test';

/** Single source of truth for the editor DOM selector */
export const EDITOR_SELECTOR = '.ProseMirror';

export class TestHelpers {
  constructor(private page: Page) {}

  /** Open a document page and wait for the editor to be interactive */
  async openDocument(documentId: string, opts?: { retry?: boolean }) {
    const maxAttempts = opts?.retry ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.page.goto(`/app/documents/${documentId}`);
      await this.page.waitForLoadState('networkidle');
      try {
        await this.page.waitForSelector(EDITOR_SELECTOR, { state: 'visible', timeout: 15000 });
        return;
      } catch {
        if (attempt === maxAttempts) throw new Error(`Editor did not appear after ${maxAttempts} attempts`);
      }
    }
  }

  /** Wait for the editor to be loaded and ready */
  async waitForEditorReady() {
    await this.page.waitForSelector(EDITOR_SELECTOR, { state: 'visible', timeout: 15000 });
  }

  /** Get the editor locator */
  getEditor() {
    return this.page.locator(EDITOR_SELECTOR).first();
  }

  /** Type text in the editor */
  async typeInEditor(text: string) {
    const editor = this.getEditor();
    await editor.click();
    await editor.pressSequentially(text, { delay: 30 });
  }

  /** Paste content in the editor */
  async pasteInEditor(content: string) {
    const editor = this.getEditor();
    await editor.click();
    await this.page.evaluate(async (t) => {
      await navigator.clipboard.writeText(t);
    }, content);
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${mod}+V`);
  }

  /** Wait for the save indicator to show "Saved" */
  async waitForSaved(timeout = 10000) {
    await expect(this.page.getByText(/^Saved$/).first()).toBeVisible({ timeout });
  }

  /** Get the current text content of the editor */
  async getEditorContent() {
    return this.getEditor().textContent();
  }

  /** Clear the editor content */
  async clearEditor() {
    const editor = this.getEditor();
    await editor.click();
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${mod}+A`);
    await this.page.keyboard.press('Delete');
  }

  /** Click the Exit link if present */
  async clickExitIfPresent() {
    const exitLink = this.page.getByRole('link', { name: /exit/i });
    if (await exitLink.count()) {
      await exitLink.first().click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /** Reload the page and verify text is still in the editor */
  async verifyPersistsOnReload(expectedText: string) {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
    await this.waitForEditorReady();
    const editor = this.getEditor();
    await expect(editor).toContainText(expectedText, { timeout: 10000 });
  }
}
```

- [ ] **Step 2: Update test-setup.ts — add helpers fixture**

```ts
import { test as base } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { E2EContext } from './seed-e2e';
import { TestHelpers } from './test-helpers';

type TestFixtures = {
  signIn: (email: string, password: string) => Promise<void>;
  e2eContext: E2EContext;
  helpers: TestHelpers;
};

export const test = base.extend<TestFixtures>({
  e2eContext: async ({}, use) => {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const e2eDir = path.resolve(__dirname, '.');
    const ctxPath = path.join(e2eDir, '.e2e-context.json');
    const envPath = path.join(e2eDir, '.env.e2e');
    if (fs.existsSync(envPath)) {
      const envEntries = fs
        .readFileSync(envPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const idx = line.indexOf('=');
          if (idx === -1) return null;
          return [line.slice(0, idx), line.slice(idx + 1)] as const;
        })
        .filter((entry): entry is readonly [string, string] => !!entry);
      for (const [key, value] of envEntries) {
        process.env[key] = value;
      }
    }
    const ctx = JSON.parse(fs.readFileSync(ctxPath, 'utf8')) as E2EContext;
    await use(ctx);
  },
  signIn: async ({ page, e2eContext }, use) => {
    const signInFn = async (email: string, password: string) => {
      await page.goto('/auth/login');
      await page.waitForLoadState('networkidle');
      const emailInput = page.locator('input[type="email"]');
      const passwordInput = page.locator('input[type="password"]');
      const submitButton = page.getByRole('button', { name: /log in/i });
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await submitButton.click();
      await page.waitForURL(
        (url) => url.pathname.startsWith('/app') || url.pathname === '/enter-code',
        { timeout: 15000 }
      );
      if (new URL(page.url()).pathname === '/enter-code') {
        await page.locator('input[name="code"]').fill(e2eContext.classCode);
        await page.getByRole('button', { name: /continue/i }).click();
        await page.waitForURL('**/app**', { timeout: 15000 });
      }
    };
    await use(signInFn);
  },
  helpers: async ({ page }, use) => {
    await use(new TestHelpers(page));
  },
});

export { expect } from '@playwright/test';
```

- [ ] **Step 3: Commit**

```bash
git add services/web-app/e2e/test-helpers.ts services/web-app/e2e/test-setup.ts
git commit -m "refactor: standardize e2e helpers — single editor selector, helpers fixture, remove dead methods"
```

---

### Task 4: Update smoke script in package.json

**Files:**
- Modify: `services/web-app/package.json`

- [ ] **Step 1: Add document-editor-invariants to smoke suite**

Change line 19 from:
```json
"test:e2e:smoke": "playwright test --project=chromium e2e/tests/auth.signin.spec.ts e2e/tests/auth.signup.student.spec.ts e2e/tests/document-editor.spec.ts e2e/tests/document-regression.spec.ts",
```

To:
```json
"test:e2e:smoke": "playwright test --project=chromium e2e/tests/auth.signin.spec.ts e2e/tests/auth.signup.student.spec.ts e2e/tests/document-editor.spec.ts e2e/tests/document-regression.spec.ts e2e/tests/document-editor-invariants.spec.ts",
```

- [ ] **Step 2: Commit**

```bash
git add services/web-app/package.json
git commit -m "chore: add invariants test to e2e smoke suite"
```

---

### Task 5: Clean up base.spec.ts and auth.signin.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/base.spec.ts`
- Modify: `services/web-app/e2e/tests/auth.signin.spec.ts`

These are already clean. Only change: ensure they import from `../test-setup` (already do). No substantive changes needed.

- [ ] **Step 1: Read both files, verify they're clean, no changes needed**

If they already pass, skip. Otherwise fix any issues.

- [ ] **Step 2: Run them to verify**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/base.spec.ts e2e/tests/auth.signin.spec.ts
```

---

### Task 6: Clean up auth.signup.student.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/auth.signup.student.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Replace `waitForTimeout` in retry helpers with `expect.poll` or `toPass` patterns
- Keep the TOTP verification logic (it's correct and necessary)
- Use `e2eContext` for class code (already does)
- Replace any `.catch(() => false)` with explicit count checks

- [ ] **Step 3: Run the test**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/auth.signup.student.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/auth.signup.student.spec.ts
git commit -m "refactor: clean up auth signup e2e — replace timeouts with condition waits"
```

---

### Task 7: Clean up assignments-feature-flag.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/assignments-feature-flag.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Feature flags are now seeded ON by default. Update "hidden" tests to toggle OFF first, "shown" tests to use default ON state.
- Already clean otherwise.

- [ ] **Step 3: Run the test**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/assignments-feature-flag.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/assignments-feature-flag.spec.ts
git commit -m "refactor: assignments flag test uses seeded-ON default"
```

---

### Task 8: Clean up document-editor.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/document-editor.spec.ts`

This is the biggest cleanup. 10 tests, many `waitForTimeout` calls, duplicated `openDocumentEditorWithRetry`, `.catch(() => false)` patterns.

- [ ] **Step 1: Read the current file fully**

- [ ] **Step 2: Apply cleanup**

Changes:
- Import `EDITOR_SELECTOR` from `../test-helpers` and use it everywhere
- Remove the local `openDocumentEditorWithRetry()` — use `helpers.openDocument(docId, { retry: true })`
- Use `e2eContext.freshDocumentId` for typing/editing tests
- Use `e2eContext.editedDocumentId` for persistence/reload tests
- Replace `waitForTimeout(4000)` after typing with `helpers.waitForSaved()`
- Replace `waitForTimeout(500)`, `waitForTimeout(1000)` between steps with `expect(locator).toBeVisible()` or similar condition-based waits
- Replace `.catch(() => false)` on `.isVisible()` with `.count() > 0`
- Delete test 4 ("demonstrate version concept") — mocks API unrealistically
- Replace `EDITOR_SELECTOR` constant defined locally with import

- [ ] **Step 3: Run the tests**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/document-editor.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/document-editor.spec.ts
git commit -m "refactor: clean document-editor e2e — use helpers, condition waits, remove dead test"
```

---

### Task 9: Clean up document-editor-invariants.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/document-editor-invariants.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Import `EDITOR_SELECTOR` from `../test-helpers`
- Use `helpers.openDocument()` instead of local `openEditor()`
- Use `e2eContext.editedDocumentId` (needs real content for the invariant check)
- Replace `waitForTimeout(500)`, `waitForTimeout(300)`, `waitForTimeout(1500)` with:
  - After visibility change: `await expect(editor).toBeVisible()` (100ms max)
  - After blur/focus: `await expect(editor).toBeFocused()` or small animation delay (100ms with comment)
  - After back/forward: `await helpers.waitForEditorReady()`
- Replace tutor `.catch(() => false)` with:
  ```ts
  const tutorButton = page.getByTestId('tutor-chat-open');
  if (await tutorButton.count() > 0) { ... }
  ```

- [ ] **Step 3: Run the test**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/document-editor-invariants.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/document-editor-invariants.spec.ts
git commit -m "refactor: clean invariants e2e — condition waits, helpers, no error swallowing"
```

---

### Task 10: Clean up document-local-backup-buckets.spec.ts and document-local-first.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/document-local-backup-buckets.spec.ts`
- Modify: `services/web-app/e2e/tests/document-local-first.spec.ts`

- [ ] **Step 1: Read both files**

- [ ] **Step 2: Clean document-local-backup-buckets.spec.ts**

Changes:
- Remove local `openDocumentEditorWithRetry()` — use `helpers.openDocument(docId, { retry: true })`
- Use `e2eContext.freshDocumentId` for the backup bucket test
- Import `EDITOR_SELECTOR`

- [ ] **Step 3: Clean document-local-first.spec.ts**

Changes:
- Use `e2eContext.teacherEmail` (already does) and `e2eContext.editedDocumentId`
- Replace `text=Saved` with `helpers.waitForSaved()`
- Replace `svg.lucide-history` with a more stable selector if a testid exists, otherwise keep

- [ ] **Step 4: Run both tests**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/document-local-backup-buckets.spec.ts e2e/tests/document-local-first.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add services/web-app/e2e/tests/document-local-backup-buckets.spec.ts services/web-app/e2e/tests/document-local-first.spec.ts
git commit -m "refactor: clean local backup + local-first e2e — use helpers, remove duplication"
```

---

### Task 11: Clean up document-regression.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/document-regression.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Import `EDITOR_SELECTOR` from `../test-helpers`
- Use `helpers.openDocument()` instead of local `openEditor()`
- Use `helpers.waitForSaved()` instead of local `waitForSaveIndicator()`
- Use `e2eContext.editedDocumentId` for all tests
- Replace `waitForTimeout(2000)` before reload with `helpers.waitForSaved()`
- Replace `waitForTimeout(1500)`, `waitForTimeout(500)`, `waitForTimeout(3000)` with condition-based waits
- Remove unused `beforeAll` block if present
- Keep `uniqueText()` helper (useful pattern)

- [ ] **Step 3: Run the tests**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/document-regression.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/document-regression.spec.ts
git commit -m "refactor: clean document-regression e2e — helpers, condition waits throughout"
```

---

### Task 12: Clean up document-data-loss-regression.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/document-data-loss-regression.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Import `EDITOR_SELECTOR`
- Use `helpers.openDocument()` and `helpers.waitForSaved()`
- Use `e2eContext.editedDocumentId`
- Replace tutor `.catch(() => false)` with `count() > 0` check
- Replace `waitForTimeout(3000)` after visibility change with `page.waitForResponse('**/api/document/*/save')`
- Replace submit `.catch(() => false)` with:
  ```ts
  const submitBtn = page.getByTestId('document-submit-button');
  if (await submitBtn.count() > 0) { ... }
  ```

- [ ] **Step 3: Run the tests**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/document-data-loss-regression.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/document-data-loss-regression.spec.ts
git commit -m "refactor: clean data-loss regression e2e — no error swallowing, condition waits"
```

---

### Task 13: Clean up student.document-submission-flow.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/student.document-submission-flow.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Use `e2eContext.editedDocumentId` for the document to submit (instead of creating a new one inline)
- Replace hardcoded `waitForTimeout(2200)` after typing with `helpers.waitForSaved()`
- Replace `waitForTimeout(500)` before save check with `helpers.waitForSaved()`
- Since feature flags are now seeded ON, remove the initial `setDocumentSubmissionForSchool(enabled: false)` call. Instead, the test should rely on the seeded ON state.
- Replace hardcoded editor selector with `EDITOR_SELECTOR`
- Keep the live AI test skip conditions (browserName, ANTHROPIC_API_KEY)

- [ ] **Step 3: Run the test (requires ANTHROPIC_API_KEY or skip)**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/student.document-submission-flow.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/student.document-submission-flow.spec.ts
git commit -m "refactor: clean student submission e2e — use seeded docs, condition waits"
```

---

### Task 14: Clean up teacher.document-submission-flow.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.document-submission-flow.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Use `e2eContext.editedDocumentId` as the document to submit (teacher submits an unsubmitted doc)
- Call `ensureDocumentUnsubmitted({ prisma, documentId: e2eContext.editedDocumentId })` at test start (to reset if prior test submitted it)
- Feature flags seeded ON — remove the `setDocumentSubmissionForSchool` call
- Use `e2eContext.teacherEmail` for sign-in (already does)

- [ ] **Step 3: Run the test**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/teacher.document-submission-flow.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/teacher.document-submission-flow.spec.ts
git commit -m "refactor: clean teacher submission e2e — use seeded docs and flags"
```

---

### Task 15: Clean up teacher.grading-flow.spec.ts

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.grading-flow.spec.ts`

- [ ] **Step 1: Read the current file**

- [ ] **Step 2: Apply cleanup**

Changes:
- Use `e2eContext.submittedDocumentId` + `e2eContext.snapshotId` instead of calling `ensureDocumentSubmitted()` inline
- Feature flags seeded ON — remove `setDocumentSubmissionForSchool(enabled: false)` at start
- Replace `waitForTimeout(1500)` pauses with condition-based waits (e.g., `expect(locator).toBeVisible()`)
- Replace hardcoded 750ms route delay with: intercept the route, let it pass through, and wait for the response
- Keep the live AI test skip conditions
- Import `EDITOR_SELECTOR`

- [ ] **Step 3: Run the test (requires ANTHROPIC_API_KEY or skip)**

```bash
cd services/web-app && npx playwright test --project=chromium e2e/tests/teacher.grading-flow.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add services/web-app/e2e/tests/teacher.grading-flow.spec.ts
git commit -m "refactor: clean teacher grading e2e — use seeded data, condition waits"
```

---

### Task 16: Run full e2e suite and fix failures

**Files:** Any test files that fail

- [ ] **Step 1: Run the smoke suite**

```bash
cd services/web-app && bun run test:e2e:smoke
```

Fix any failures. Common issues:
- Selector mismatches (editor content changed due to new seed data)
- Timing issues (condition waits too tight)
- Context field name changes (e.g., `documentId` → `editedDocumentId`)

- [ ] **Step 2: Run the full suite (if ANTHROPIC_API_KEY available)**

```bash
cd services/web-app && bun run test:e2e:full
```

- [ ] **Step 3: Fix any remaining failures and commit**

```bash
git add -A services/web-app/e2e
git commit -m "fix: resolve e2e test failures after overhaul"
```
