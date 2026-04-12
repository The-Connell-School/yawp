# E2E Test Suite Overhaul — Design Spec

**Date:** 2026-04-09
**Branch:** `document-hardening`
**Goal:** Make the e2e suite trustworthy enough to validate Phase 1 QA and serve as the ongoing regression safety net.

---

## 1. Infrastructure Cleanup

### Delete dead files

- **`e2e/prisma/schema.prisma`** — diverged copy of the production schema, never used by `prepare-e2e.ts` or `prisma-client.ts`. Delete the entire `e2e/prisma/` directory.

### Simplify `prepare-e2e.ts`

Remove the production dump path (S3 download, `seed-overlay.ts` — which doesn't even exist). The simplified flow:

```
start Postgres (Docker or provided URL)
  → reset DB (drop + create)
  → write .env.e2e
  → prisma generate (from packages/prisma)
  → prisma migrate deploy (from packages/prisma)
  → run seedE2E()
  → write .e2e-context.json
```

No AWS credentials, no S3 dump, no overlay script. One path, always deterministic.

### Standardize editor selector

Replace the triple-fallback `'.ProseMirror, [contenteditable="true"], [data-testid="editor"]'` with a single exported constant:

```ts
// test-helpers.ts
export const EDITOR_SELECTOR = '.ProseMirror';
```

Every test file imports this. If the editor markup changes, one place to update.

### Consolidate shared helpers

- Move `openDocumentEditorWithRetry()` into `test-helpers.ts` (currently duplicated in `document-editor.spec.ts` and `document-local-backup-buckets.spec.ts`).
- Delete unused methods from `TestHelpers`: `mockAuthentication()`, `navigateToDocument()`.

---

## 2. Seed Redesign

The current synthetic seed creates 1 org, 1 school, 1 class, 3 users, 1 document. That's too thin — tests that need submitted documents, graded documents, or assignment data have to create them inline, making tests verbose and fragile.

### Seed entities

The new seed creates a complete, realistic data set using the production `packages/prisma` schema:

| Entity | Count | Purpose |
|--------|-------|---------|
| Organization | 1 | "The Connell School" |
| School | 1 | "E2E High" |
| Class | 1 | code `E2E-CLASS`, with teacher assigned |
| Student user | 1 | `jdoe@brock.software` / `johndoe` |
| Admin user | 1 | `admin.e2e@yawp.test` / `admin-e2e-password` |
| Teacher user | 1 | `teacher.e2e@yawp.test` / `teacher-e2e-password` |
| StudentProfile | 1 | linked to class |
| StudentCourse | 1 | 3 modules, each with 3 instructions |
| **Documents** | **4** | see below |
| DocumentRevision | 2 | on the edited doc (session-start + auto) |
| DocumentSnapshot | 1 | on the submitted doc |
| Grade | 1 | on the graded doc, with rubric scores |
| GradeComment | 2 | on the graded doc |
| Setting | 2 | feature flags (submission enabled, assignments enabled) |
| ClassStudentCourse | 1 | links class to student course |

### Document states

Four documents, each in a distinct lifecycle state:

| Doc | Title | State | Has content | Has snapshot | Has grade |
|-----|-------|-------|-------------|-------------|-----------|
| `doc-fresh` | "Fresh Document" | New, empty-ish | Minimal starter text | No | No |
| `doc-edited` | "Edited Document" | Has revisions | Real paragraph with grammar errors | No | No |
| `doc-submitted` | "Submitted Document" | Submitted | Full essay | Yes (snapshot) | No |
| `doc-graded` | "Graded Document" | Graded + released | Full essay | Yes (snapshot) | Yes (77%, released) |

This means:
- Editor tests use `doc-fresh` or `doc-edited` (no submission baggage)
- Submission tests use `doc-edited` (submit it during the test)
- Grading tests use `doc-submitted` (grade it during the test)
- Read-only / released-grade tests use `doc-graded`

### E2EContext expansion

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

### Feature flags seeded

The seed writes two `Setting` rows:
- `document_submission_enabled = true` + `document_submission_enabled_school_ids` = school ID
- `assignments_enabled_org_ids` = org ID

Tests that need flags OFF can toggle them via db-helpers (existing pattern). But the default state has features ON, matching production.

---

## 3. Test Helper & Fixture Standardization

### Replace `waitForTimeout` with condition-based waits

Every `page.waitForTimeout(N)` gets replaced with one of:
- `page.waitForSelector(selector, { state: 'visible' })` — wait for element
- `expect(locator).toBeVisible({ timeout: N })` — wait for assertion
- `expect.poll(() => ..., { timeout: N })` — poll a condition
- `page.waitForResponse(url)` — wait for network
- `page.waitForURL(pattern)` — wait for navigation

The only acceptable `waitForTimeout` is a brief pause for animation/transition (100-300ms), documented with a comment.

### Remove `.catch(() => false)` error swallowing

Current pattern:
```ts
const visible = await button.isVisible({ timeout: 3000 }).catch(() => false);
if (visible) { ... }
```

This masks real failures. Replace with explicit conditional checks:
```ts
const count = await button.count();
if (count > 0) { ... }
```

Or use `test.skip()` for features that may not be present:
```ts
test.skip(!await button.count(), 'Submit button not present');
```

### Shared test fixtures

Add a `helpers` fixture to `test-setup.ts` that provides a `TestHelpers` instance pre-bound to the current page, so tests don't construct it manually:

```ts
export const test = base.extend<{
  e2eContext: E2EContext;
  signIn: (email: string, password: string) => Promise<void>;
  helpers: TestHelpers;
}>({
  // ...existing fixtures...
  helpers: async ({ page }, use) => {
    await use(new TestHelpers(page));
  },
});
```

### Editor interaction helpers

Consolidate into `TestHelpers`:

```ts
class TestHelpers {
  // existing methods stay

  /** Open a document and wait for the editor to be ready */
  async openDocument(documentId: string, opts?: { retry?: boolean }): Promise<void>;

  /** Type text into the editor with realistic key delays */
  async typeInEditor(text: string): Promise<void>;

  /** Wait for the save indicator to show "Saved" */
  async waitForSaved(timeout?: number): Promise<void>;

  /** Get the current editor text content */
  async getEditorContent(): Promise<string>;

  /** Verify content persists across a page reload */
  async verifyPersistsOnReload(expectedText: string): Promise<void>;
}
```

---

## 4. Individual Test File Cleanup

### General principles applied to every file

1. Import `EDITOR_SELECTOR` from test-helpers instead of hardcoding
2. Replace all `waitForTimeout` with condition-based waits
3. Remove `.catch(() => false)` patterns
4. Use `helpers` fixture instead of constructing `TestHelpers` manually
5. Use the appropriate seeded document for each test's needs

### Per-file changes

**`base.spec.ts`** (3 tests) — minimal changes, already clean.

**`auth.signin.spec.ts`** (1 test) — no changes needed.

**`auth.signup.student.spec.ts`** (1 test) — replace `waitForTimeout` in retry helpers with `expect.poll` or `toPass`. Extract `fillCodeInputWithRetry` into test-helpers since it's shared with teacher grading flow.

**`assignments-feature-flag.spec.ts`** (4 tests) — already clean. Update to use seeded feature flags (start enabled, toggle OFF for the "hidden" tests).

**`document-editor.spec.ts`** (10 tests) — biggest cleanup:
- Replace 6+ `waitForTimeout` calls with condition-based waits
- Remove `openDocumentEditorWithRetry` (use helpers.openDocument)
- Remove `.catch(() => false)` on isVisible checks
- Use `e2eContext.freshDocumentId` for typing tests, `e2eContext.editedDocumentId` for persistence tests
- Delete test 4 ("demonstrate version concept") — it mocks the save API to simulate version conflicts, but the mock doesn't reflect real server behavior and gives false confidence

**`document-editor-invariants.spec.ts`** (1 test) — replace `waitForTimeout` pauses between interactions with `waitForSelector` or short animation delays (100ms). Replace tutor `.catch(() => false)` with explicit count check.

**`document-local-backup-buckets.spec.ts`** (1 test) — remove duplicated `openDocumentEditorWithRetry`, use helpers.

**`document-local-first.spec.ts`** (1 test) — replace hardcoded selectors (`svg.lucide-history`, `text=Saved`) with testid-based or semantic selectors. Use seeded teacher context.

**`document-regression.spec.ts`** (13 tests) — replace `waitForTimeout` calls (2s, 1.5s, 3s) with `waitForSaved()` helper. Use `EDITOR_SELECTOR` constant. Remove the unused `beforeAll` block.

**`document-data-loss-regression.spec.ts`** (3 tests) — replace tutor `.catch(() => false)` with count check. Replace `waitForTimeout(3000)` after visibility change with `page.waitForResponse('/api/document/*/save')`. Replace submit `.catch(() => false)` with conditional skip.

**`student.document-submission-flow.spec.ts`** (1 test) — use `e2eContext.editedDocumentId` instead of creating a new document inline. Replace hardcoded timeouts with `waitForResponse` and `waitForURL`. Extract TOTP/signup helpers into shared module (duplicated with teacher flow).

**`teacher.document-submission-flow.spec.ts`** (1 test) — use `e2eContext.submittedDocumentId` is wrong here (teacher submits an unsubmitted doc). Keep using `ensureDocumentUnsubmitted()` pattern but with `editedDocumentId`.

**`teacher.grading-flow.spec.ts`** (1 test) — use `e2eContext.submittedDocumentId` + `e2eContext.snapshotId` instead of calling `ensureDocumentSubmitted()` inline. Extract TOTP signup flow into shared helper. Replace hardcoded 750ms route delay with deterministic wait.

---

## 5. Test Execution

### Smoke suite (CI gate)

```
auth.signin.spec.ts
auth.signup.student.spec.ts
document-editor.spec.ts
document-regression.spec.ts
document-editor-invariants.spec.ts
```

Fast, no AI calls, covers auth + core editor + persistence + invariants.

### Full suite (pre-merge / nightly)

All test files including AI-dependent flows (student submission, teacher grading). Requires `ANTHROPIC_API_KEY`.

### Scripts

Update `test:e2e:smoke` in `package.json` to add `document-editor-invariants.spec.ts` to the smoke gate. `test:e2e:full` stays as-is (runs all files).

---

## 6. What This Does NOT Cover

- **Periodic revision test (5-min idle)** — not practical in e2e (would need to mock the timer or wait 5 minutes). Better tested via unit test on `createRevisionScheduler`, which already exists.
- **Real tab close/reopen** — Playwright doesn't support true tab close + reopen with IDB persistence. The back/forward navigation test in invariants is the closest practical proxy.
- **Multi-browser parity** — Firefox project stays but is not in the smoke gate. Chromium is the primary target.
