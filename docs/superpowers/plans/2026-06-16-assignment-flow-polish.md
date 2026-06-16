# Assignment Flow Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Brian's assignment-flow polish with e2e-first coverage and small backward-compatible UI changes.

**Architecture:** Keep the existing Assignments route as the assignment-builder host and add a safe `returnTo` target for dashboard launches. Preserve the current checkbox/bulk-delete Assignments table behavior, compact the existing class header tab bar, and reorder the existing dashboard grading stat strip above the grading mode cards.

**Tech Stack:** React Router 7, React 18, Bun unit tests, Playwright e2e, Tailwind utility classes, existing Yawp UI components.

---

## File Structure

- Modify `services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts`: add failing e2e coverage for dashboard quick-create return and dashboard grading order.
- Modify `services/web-app/e2e/tests/teacher.assignments-page.spec.ts`: strengthen checkbox-style delete e2e coverage with accessible checkbox locators and selected-action assertions.
- Modify `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`: add failing e2e coverage proving the Students/Documents tab group is compact and left-aligned.
- Modify `services/web-app/app/routes/app.assignments._index/route.test.ts`: add unit coverage for safe assignment-create return targets.
- Modify `services/web-app/app/routes/app.assignments._index/route.tsx`: export return-target sanitizer, remember sanitized `returnTo`, navigate to it when the create sheet exits, and add assignment checkbox labels.
- Modify `services/web-app/app/routes/app._index/components/assignments-at-a-glance.tsx`: append `returnTo=/app` to dashboard assignment-create links.
- Modify `services/web-app/app/routes/app._index/components/teacher-grading-at-a-glance.tsx`: render To grade / To release above grading mode cards.
- Modify `services/web-app/app/routes/app.my-classes.$classId/class-detail-header.tsx`: make the Students/Documents tab group compact and left-aligned.

## Task 1: Dashboard Quick-Create Return

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts`
- Modify: `services/web-app/app/routes/app.assignments._index/route.test.ts`
- Modify: `services/web-app/app/routes/app.assignments._index/route.tsx`
- Modify: `services/web-app/app/routes/app._index/components/assignments-at-a-glance.tsx`

- [ ] **Step 1: Write the failing unit tests for safe return targets**

Add this import target to the existing dynamic import in `services/web-app/app/routes/app.assignments._index/route.test.ts`:

```ts
const { action, sanitizeAssignmentCreateReturnTo } = await import('./route');
```

Add these tests inside the existing `describe('app.assignments action', () => { ... })` block:

```ts
  test('allows safe app return targets for assignment creation', () => {
    expect(sanitizeAssignmentCreateReturnTo('/app')).toBe('/app');
    expect(
      sanitizeAssignmentCreateReturnTo('/app/my-classes/class-1?tab=documents')
    ).toBe('/app/my-classes/class-1?tab=documents');
  });

  test('rejects unsafe assignment creation return targets', () => {
    expect(sanitizeAssignmentCreateReturnTo('')).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo(null)).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('assignments')).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('https://example.com/app')).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('//example.com/app')).toBeNull();
    expect(sanitizeAssignmentCreateReturnTo('/application')).toBeNull();
  });
```

- [ ] **Step 2: Run the unit test and verify RED**

Run:

```bash
cd services/web-app
bun test app/routes/app.assignments._index/route.test.ts
```

Expected: fail because `sanitizeAssignmentCreateReturnTo` is not exported.

- [ ] **Step 3: Write the failing dashboard e2e**

In `services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts`, add this helper near the other helpers:

```ts
async function deleteAssignmentsByTitle(title: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.assignment.deleteMany({ where: { title } });
  } finally {
    await prisma.$disconnect();
  }
}
```

Update the existing Assignments link assertion:

```ts
    await expect(
      assignmentsGrid.getByRole('link', { name: /new assignment/i })
    ).toHaveAttribute('href', '/app/assignments?create=1&returnTo=%2Fapp');
```

Add this test inside `test.describe.serial('Teacher dashboard workspace', () => { ... })`:

```ts
  test('returns to the dashboard after quick-creating from an assignment card', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const title = `Dashboard Quick Create ${Date.now()}`;
    const prompt = `Dashboard quick-create prompt ${Date.now()}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');
      await page.waitForLoadState('networkidle');

      await page
        .getByTestId('teacher-assignments-grid')
        .getByLabel('New E2E Course assignment')
        .click();
      await expectStandardizedAssignmentForm(page);

      await page.getByLabel(CLASS_LABEL).check();
      await page.getByLabel('Title (optional)').fill(title);
      await page.getByLabel('Prompt').fill(prompt);
      await page.getByLabel(/point value/i).fill('25');
      await page.getByRole('button', { name: 'Create Assignment' }).click();

      await page.waitForURL((url) => url.pathname === '/app' && url.search === '');
      await expect(page.getByTestId('app._index')).toBeVisible();
      await expect(page.getByTestId('teacher-assignments-grid')).toBeVisible();

      await expectCreatedAssignment({
        classId: e2eContext.classId,
        assignmentTypeId: e2eContext.assignmentTypeId,
        prompt,
        title,
        pointValue: 25,
      });
    } finally {
      await deleteAssignmentsByTitle(title);
    }
  });
```

- [ ] **Step 4: Run the dashboard e2e and verify RED**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.dashboard-workspace.spec.ts
```

Expected: fail because the dashboard links do not include `returnTo` and the create flow remains on `/app/assignments`.

- [ ] **Step 5: Implement the safe return helper and Assignments route behavior**

In `services/web-app/app/routes/app.assignments._index/route.tsx`, update the imports:

```ts
import { Form, Link, useLoaderData, useNavigate, useSearchParams } from 'react-router';
```

Add this helper near `formatClassLabel`:

```ts
export function sanitizeAssignmentCreateReturnTo(value: string | null) {
  if (!value) return null;
  if (value === '/app' || value.startsWith('/app/') || value.startsWith('/app?')) {
    return value;
  }
  return null;
}
```

Inside `AssignmentsRoute`, add:

```ts
  const navigate = useNavigate();
  const [createReturnTo, setCreateReturnTo] = useState<string | null>(null);
```

In the `create=1` effect, before stripping params:

```ts
    setCreateReturnTo(
      sanitizeAssignmentCreateReturnTo(searchParams.get('returnTo'))
    );
```

Also delete the transient return param:

```ts
    next.delete('returnTo');
```

Update `AssignmentCreationSheet` `onOpenChange`:

```ts
        onOpenChange={(open) => {
          setIsCreateSheetOpen(open);
          if (!open) {
            const returnTo = createReturnTo;
            setDuplicateAssignment(null);
            setCreateAssignmentTypeId(undefined);
            setCreateReturnTo(null);
            if (returnTo) {
              navigate(returnTo, { replace: true });
            }
          }
        }}
```

- [ ] **Step 6: Add dashboard return targets**

In `services/web-app/app/routes/app._index/components/assignments-at-a-glance.tsx`, add:

```ts
const DASHBOARD_ASSIGNMENT_CREATE_RETURN_TO = encodeURIComponent('/app');
```

Change the header link to:

```tsx
          to={`/app/assignments?create=1&returnTo=${DASHBOARD_ASSIGNMENT_CREATE_RETURN_TO}`}
```

Change the card `+` link to:

```tsx
                    to={`/app/assignments?create=1&assignmentType=${assignmentType.id}&returnTo=${DASHBOARD_ASSIGNMENT_CREATE_RETURN_TO}`}
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
cd services/web-app
bun test app/routes/app.assignments._index/route.test.ts
playwright test --project=chromium e2e/tests/teacher.dashboard-workspace.spec.ts
```

Expected: both pass.

Commit:

```bash
git add services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts services/web-app/app/routes/app.assignments._index/route.test.ts services/web-app/app/routes/app.assignments._index/route.tsx services/web-app/app/routes/app._index/components/assignments-at-a-glance.tsx
git commit -m "fix: return dashboard assignment creates to launcher"
```

## Task 2: Assignments Checkbox Delete Affordance

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.assignments-page.spec.ts`
- Modify: `services/web-app/app/routes/app.assignments._index/route.tsx`

- [ ] **Step 1: Write the failing e2e affordance assertions**

In `services/web-app/e2e/tests/teacher.assignments-page.spec.ts`, update the delete test name:

```ts
  test('deletes selected assignments with checkbox-style bulk actions while keeping student documents', async ({
```

Replace the selection block with:

```ts
      await expect(
        page.getByRole('button', { name: /Delete 1 assignment\(s\)/ })
      ).toHaveCount(0);

      const rowCheckbox = row.getByRole('checkbox', {
        name: new RegExp(`Select assignment ${title}`),
      });
      await expect(rowCheckbox).toBeVisible();
      await rowCheckbox.check();
      await expect(
        page.getByRole('button', { name: /Delete 1 assignment\(s\)/ })
      ).toBeVisible();

      page.once('dialog', (dialog) => dialog.accept());
      await page
        .getByRole('button', { name: /Delete 1 assignment\(s\)/ })
        .click();
```

- [ ] **Step 2: Run the Assignments e2e and verify RED**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.assignments-page.spec.ts
```

Expected: fail because row assignment checkboxes do not yet have accessible labels.

- [ ] **Step 3: Add checkbox labels**

In `services/web-app/app/routes/app.assignments._index/route.tsx`, add to the header checkbox:

```tsx
                          aria-label="Select all assignments"
```

Add to each row checkbox:

```tsx
                              aria-label={`Select assignment ${
                                assignment.title?.trim() ||
                                'Untitled Assignment'
                              }`}
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.assignments-page.spec.ts
```

Expected: pass.

Commit:

```bash
git add services/web-app/e2e/tests/teacher.assignments-page.spec.ts services/web-app/app/routes/app.assignments._index/route.tsx
git commit -m "test: cover assignment checkbox delete"
```

## Task 3: Compact Class Header Counts

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`
- Modify: `services/web-app/app/routes/app.my-classes.$classId/class-detail-header.tsx`

- [ ] **Step 1: Write the failing compact-header e2e**

In `services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts`, add this assertion to the `compact header shows class identity, counts, and actions` test after `const header = ...`:

```ts
    const headerBox = await header.boundingBox();
    const tablist = header.getByRole('tablist', { name: 'Class sections' });
    const tablistBox = await tablist.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(tablistBox).not.toBeNull();
    expect(tablistBox!.x - headerBox!.x).toBeGreaterThanOrEqual(12);
    expect(tablistBox!.x - headerBox!.x).toBeLessThan(40);
    expect(tablistBox!.width).toBeLessThan(headerBox!.width * 0.7);
```

- [ ] **Step 2: Run the class page e2e and verify RED**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.class-page-redesign.spec.ts
```

Expected: fail because the current tablist spans the banner.

- [ ] **Step 3: Compact `ClassHeaderTabBar`**

In `services/web-app/app/routes/app.my-classes.$classId/class-detail-header.tsx`, change the tablist container classes to compact inline sizing:

```tsx
      className="relative inline-flex max-w-full items-stretch overflow-hidden rounded-lg bg-muted/40 ring-1 ring-black/5"
```

Change the indicator classes to:

```tsx
          'pointer-events-none absolute inset-y-1 rounded-md bg-secondary shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_2px_6px_rgba(0,0,0,0.08)] ring-1 ring-inset ring-black/10 transition-[left,width] duration-300 ease-out'
```

Change each tab button to a compact inline layout:

```tsx
            className={cn(
              'relative inline-flex min-w-0 items-center gap-2 px-4 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              activeTab === tab.id
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
```

Replace the stacked label/count block with:

```tsx
            <span className="truncate">{tab.label}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {tab.value}
            </span>
```

Wrap the header tab bar with compact left padding:

```tsx
      <div className="border-t border-border/60 bg-white px-4 py-3 sm:px-5">
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.class-page-redesign.spec.ts
```

Expected: pass.

Commit:

```bash
git add services/web-app/e2e/tests/teacher.class-page-redesign.spec.ts 'services/web-app/app/routes/app.my-classes.$classId/class-detail-header.tsx'
git commit -m "fix: compact class header counts"
```

## Task 4: Dashboard Grading Bar Order

**Files:**
- Modify: `services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts`
- Modify: `services/web-app/app/routes/app._index/components/teacher-grading-at-a-glance.tsx`

- [ ] **Step 1: Write the failing dashboard order e2e**

In `services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts`, add this assertion to `presents classes first with Assignments and Grading entry points` after the grading grid visibility checks:

```ts
    const toGradeBox = await gradingGrid
      .getByText('To grade', { exact: true })
      .boundingBox();
    const byStudentBox = await gradingGrid
      .getByRole('link', { name: /By student/i })
      .boundingBox();
    expect(toGradeBox).not.toBeNull();
    expect(byStudentBox).not.toBeNull();
    expect(toGradeBox!.y).toBeLessThan(byStudentBox!.y);
```

- [ ] **Step 2: Run the dashboard e2e and verify RED**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.dashboard-workspace.spec.ts
```

Expected: fail because the To grade strip is below the mode-card grid.

- [ ] **Step 3: Reorder the existing grading components**

In `services/web-app/app/routes/app._index/components/teacher-grading-at-a-glance.tsx`, change the non-empty render branch to render the stat strip first:

```tsx
        <>
          <GradingQueueStatStrip
            needsGradingCount={needsGradingCount}
            readyToReleaseCount={readyToReleaseCount}
          />
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            ...
          </div>
        </>
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
cd services/web-app
playwright test --project=chromium e2e/tests/teacher.dashboard-workspace.spec.ts
```

Expected: pass.

Commit:

```bash
git add services/web-app/e2e/tests/teacher.dashboard-workspace.spec.ts services/web-app/app/routes/app._index/components/teacher-grading-at-a-glance.tsx
git commit -m "fix: prioritize dashboard grading queue"
```

## Task 5: Final Verification

**Files:**
- No new files expected.

- [ ] **Step 1: Run targeted unit and e2e tests**

Run:

```bash
cd services/web-app
bun test app/routes/app.assignments._index/route.test.ts
playwright test --project=chromium e2e/tests/teacher.dashboard-workspace.spec.ts e2e/tests/teacher.assignments-page.spec.ts e2e/tests/teacher.class-page-redesign.spec.ts
```

Expected: all pass.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd services/web-app
bun run typecheck
```

Expected: pass.

- [ ] **Step 3: Run smoke suite if runtime allows**

Run:

```bash
cd services/web-app
bun run test:e2e:smoke
```

Expected: pass. If this is too slow or environment-blocked, record the exact blocker and keep targeted passing evidence.

- [ ] **Step 4: Final git status**

Run:

```bash
git status --short --branch
```

Expected: clean working tree on `codex/assignment-flow-polish-spec`.

## Self-Review

- Spec coverage: Tasks cover dashboard quick-create return, Assignments checkbox delete, compact Students/Documents counts, latest dashboard grading-bar order, TDD, and final verification.
- Placeholder scan: no task uses TBD, TODO, "implement later", or unspecified test work.
- Type consistency: `sanitizeAssignmentCreateReturnTo`, `createReturnTo`, `DASHBOARD_ASSIGNMENT_CREATE_RETURN_TO`, and the Playwright locators are named consistently across tasks.
