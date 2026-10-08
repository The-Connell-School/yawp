import { test, expect } from '../test-setup';

const STUDENT_EMAIL = 'jdoe@brock.software';
const STUDENT_PASSWORD = 'johndoe';

// Seeded student documents (see e2e/seed-e2e.ts):
//   Fresh Document           — no class, no submission      → In Progress
//   Edited Document          — E2E class, no submission     → In Progress
//   E2E Document workspace…  — E2E class, submitted         → Submitted
//   Unreleased graded        — E2E class, graded not released → Submitted
//   Graded Document          — E2E class, released          → Graded
const CLASS_LABEL = /Grade 9th • Period 1st/;
const UNASSIGNED_LABEL = 'Not tied to a class';

async function signInAsStudent(page: import('@playwright/test').Page) {
  await page.goto('/auth/login');
  await page.getByLabel('Email or handle').fill(STUDENT_EMAIL);
  await page.locator('input[type="password"]').fill(STUDENT_PASSWORD);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL('**/app**', { timeout: 15000 });
  await page.goto('/app/my-documents');
  await expect(page.getByTestId('app.my-documents._index')).toBeVisible();
}

function documentCard(page: import('@playwright/test').Page, title: string) {
  return page.getByTestId('app.my-documents._index').getByRole('heading', {
    name: title,
    exact: true,
  });
}

test.describe.serial('Student My Documents: class / assignment / status filters', () => {
  test('status pills carry counts and filter the list, mirroring the teacher surface', async ({
    page,
  }) => {
    await signInAsStudent(page);

    const chips = page.getByTestId('my-documents-status-chips');
    await expect(chips).toBeVisible();

    // Student vocabulary is three states, not the teacher's four. There is no
    // "Needs Grading" / "Needs Releasing" split on this surface.
    await expect(chips.getByRole('tab', { name: /Needs Grading/ })).toHaveCount(0);
    await expect(chips.getByRole('tab', { name: /Needs Releasing/ })).toHaveCount(0);

    await expect(chips.getByRole('tab', { name: /^All\s+5/ })).toBeVisible();
    await expect(
      chips.getByRole('tab', { name: /In Progress\s+2/ })
    ).toBeVisible();
    await expect(chips.getByRole('tab', { name: /Submitted\s+2/ })).toBeVisible();
    await expect(chips.getByRole('tab', { name: /Graded\s+1/ })).toBeVisible();

    await chips.getByRole('tab', { name: /Graded\s+1/ }).click();
    await expect(page).toHaveURL(/status=graded/);
    await expect(chips.getByRole('tab', { name: /Graded/ })).toHaveAttribute(
      'aria-selected',
      'true'
    );

    await expect(documentCard(page, 'Graded Document')).toBeVisible();
    await expect(documentCard(page, 'Fresh Document')).toHaveCount(0);
    await expect(documentCard(page, 'Unreleased graded')).toHaveCount(0);

    // A grade the teacher has not released still reads as Submitted.
    await chips.getByRole('tab', { name: /Submitted\s+2/ }).click();
    await expect(documentCard(page, 'Unreleased graded')).toBeVisible();
    await expect(documentCard(page, 'Graded Document')).toHaveCount(0);
  });

  test('the class filter narrows the list and the URL survives a reload', async ({
    page,
  }) => {
    await signInAsStudent(page);

    await expect(page.getByText(UNASSIGNED_LABEL)).toBeVisible();

    await page.getByTestId('my-documents-filter-trigger').click();
    await page.getByRole('button', { name: /All classes/ }).click();
    await page.getByRole('option', { name: UNASSIGNED_LABEL }).click();

    await expect(page).toHaveURL(/class=__unassigned__/);
    await expect(documentCard(page, 'Fresh Document')).toBeVisible();
    await expect(documentCard(page, 'Graded Document')).toHaveCount(0);

    // Close the filter popovers, then confirm the class group header is gone.
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(
      page.getByTestId('app.my-documents._index').getByText(CLASS_LABEL)
    ).toHaveCount(0);
    await expect(
      page.getByTestId('app.my-documents._index').getByText(UNASSIGNED_LABEL)
    ).toBeVisible();

    // Linkable: the same URL reloads into the same filtered view.
    await page.reload();
    await expect(documentCard(page, 'Fresh Document')).toBeVisible();
    await expect(documentCard(page, 'Graded Document')).toHaveCount(0);
    await expect(
      page.getByTestId('my-documents-filter-trigger')
    ).toContainText('1');
  });

  test('the assignment filter narrows the list', async ({ page }) => {
    await signInAsStudent(page);

    await page.getByTestId('my-documents-filter-trigger').click();
    await page.getByRole('button', { name: /All assignments/ }).click();
    await page.getByRole('option').first().click();

    await expect(page).toHaveURL(/assignment=/);

    // The seeded free-write is not tied to any assignment.
    await expect(documentCard(page, 'Fresh Document')).toHaveCount(0);
    await expect(documentCard(page, 'Graded Document')).toBeVisible();
  });

  test('a filter combination with no results says so instead of rendering blank', async ({
    page,
  }) => {
    await signInAsStudent(page);

    // Documents with no class also have no submissions, so unassigned + graded
    // is a real combination that matches nothing.
    await page.goto('/app/my-documents?class=__unassigned__&status=graded');

    const empty = page.getByTestId('my-documents-empty');
    await expect(empty).toBeVisible();
    await expect(empty).toContainText('No documents found');
    await expect(empty).toContainText('Try adjusting your filters');

    // The pills stay on screen so the student can get back out.
    await expect(page.getByTestId('my-documents-status-chips')).toBeVisible();
  });

  test('Clear all returns the student to the full list', async ({ page }) => {
    await signInAsStudent(page);

    await page.goto('/app/my-documents?class=__unassigned__&status=graded');
    await expect(page.getByTestId('my-documents-empty')).toBeVisible();

    await page.getByTestId('my-documents-filter-trigger').click();
    await page.getByRole('button', { name: /Clear all/ }).click();

    await expect(page).toHaveURL(/\/app\/my-documents\??$/);
    await expect(page.getByTestId('my-documents-empty')).toHaveCount(0);
    await expect(documentCard(page, 'Fresh Document')).toBeVisible();
    await expect(documentCard(page, 'Graded Document')).toBeVisible();
  });
});
