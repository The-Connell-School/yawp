import type { Page } from '@playwright/test';
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

async function assertHeroAndGridLayout(page: Page) {
  // Defect #2: the hero container (with the "Writing practice" heading)
  // must render at its full natural height, not be crushed to ~0px by
  // flexbox shrink stealing all the available space because of its
  // `overflow-hidden`. A collapsed container clips its children even
  // though the children's own bounding boxes look unaffected, so this
  // asserts on the container itself rather than the heading.
  // See app.writing-lessons._index/route.tsx.
  const hero = page.getByTestId('writing-practice-hero');
  await expect(hero).toBeVisible();
  const heroBox = await hero.boundingBox();
  expect(heroBox?.height).toBeGreaterThan(100);

  const heading = page.getByRole('heading', { name: /writing practice/i });
  await expect(heading).toBeVisible();

  // Defect #1: the scrollable section must not have its content escape its
  // own width.
  const overflowInfo = await page.evaluate(() => {
    const section = document.querySelector('section');
    return section
      ? { scrollWidth: section.scrollWidth, clientWidth: section.clientWidth }
      : null;
  });
  expect(overflowInfo).not.toBeNull();
  expect(overflowInfo!.scrollWidth).toBeLessThanOrEqual(overflowInfo!.clientWidth);

  // Defect #3: a lesson with a long title must not balloon its row's
  // height far past its neighbors. "Commas: Sentences with Independent and
  // Dependent Clauses" is the longest static title.
  const longTitleCard = page.getByTestId(
    'writing-lesson-card-commas-independent-dependent-clauses'
  );
  await expect(longTitleCard).toBeVisible();
  const longTitleBox = await longTitleCard.boundingBox();
  expect(longTitleBox?.height).toBeLessThan(260);
}

test.describe.serial('Writing practice prototype', () => {
  test('shows writing practice on the student dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /writing practice/i })
    ).toBeVisible();
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing practice/i })
    ).toBeVisible();

    const studentIntro = page.getByTestId('writing-practice-student-intro');
    await expect(studentIntro).toBeVisible();
    await expect(studentIntro).toContainText(
      'This is practice, not graded work.'
    );
    await expect(studentIntro).toContainText(
      'Pick a lesson below, read the example, then answer the practice prompt.'
    );
    await expect(studentIntro).not.toContainText("your students' writing");

    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /comma splices/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /pronoun agreement/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^New .+ assignment$/ })
    ).toHaveCount(0);

    await page.getByRole('link', { name: /revising for wordiness/i }).click();

    await expect(
      page.getByRole('heading', {
        name: 'Revising for Wordiness',
        level: 2,
      })
    ).toBeVisible();
    await expect(page.getByText(/practice prompt/i)).toBeVisible();
    await expect(
      page.getByRole('complementary').getByText('At this point in time')
    ).toBeVisible();

    await page
      .getByLabel(/your practice response/i)
      .fill('We cannot accept new applications now.');
    await page.getByRole('button', { name: /check response/i }).click();

    await expect(page.getByText(/score preview/i)).toBeVisible();
    await expect(page.getByText(/ready for tutor review/i)).toBeVisible();
    await page.getByRole('button', { name: /try another prompt/i }).click();
    await expect(page.getByText(/weak construction/i)).toBeVisible();
  });

  test('lays out the hero and lesson grid without overflow or clipping (teacher)', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // A common laptop width, narrower than a typical external monitor,
    // so a regression to the flex/overflow bug would surface.
    await page.setViewportSize({ width: 1024, height: 800 });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons');
    await assertHeroAndGridLayout(page);
  });

  test('lays out the hero and lesson grid without overflow or clipping (student)', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await page.setViewportSize({ width: 1024, height: 800 });

    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');
    await assertHeroAndGridLayout(page);
  });

  test('lets a teacher create a lesson assignment from the card plus button', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const assignmentTitle = `Wordiness practice ${Date.now()}`;

    try {
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/writing-lessons');

      await expect(
        page.getByTestId('writing-practice-student-intro')
      ).toHaveCount(0);

      const lessonCard = page.getByTestId(
        'writing-lesson-card-revising-for-wordiness'
      );
      await expect(lessonCard).toBeVisible();

      const createButton = lessonCard.getByRole('button', {
        name: 'New Revising for Wordiness assignment',
      });
      await expect(createButton).toBeVisible();
      await createButton.click();

      const dialog = page.getByRole('dialog');
      await expect(
        dialog.getByRole('heading', {
          name: 'Assign Revising for Wordiness',
        })
      ).toBeVisible();
      await dialog.getByLabel('Assignment title').fill(assignmentTitle);
      const classCheckbox = dialog.getByRole('checkbox');
      await expect(classCheckbox).toHaveCount(1);
      await classCheckbox.check();
      await dialog.getByLabel('Due date').fill('2026-09-01');
      await expect(dialog.getByLabel('Number of problems')).toHaveValue('5');
      await dialog.getByRole('button', { name: 'Assign practice' }).click();

      await expect(
        dialog.getByText('Practice assigned to 1 class.')
      ).toBeVisible();

      await expect
        .poll(() =>
          prisma.writingPracticeAssignment.count({
            where: { title: assignmentTitle },
          })
        )
        .toBe(1);
    } finally {
      await prisma.writingPracticeAssignment.deleteMany({
        where: { title: assignmentTitle },
      });
      await prisma.$disconnect();
    }
  });
});
