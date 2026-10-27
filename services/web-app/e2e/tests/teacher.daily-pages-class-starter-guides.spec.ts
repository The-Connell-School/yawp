import { test, expect } from '../test-setup';
import type { E2EContext } from '../seed-e2e';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const STUDENT_PASSWORD = 'johndoe';

const GUIDES = [
  {
    name: 'Daily Pages',
    typeId: (ctx: E2EContext) => ctx.dailyPagesAssignmentTypeId,
    heading: /short paragraphs that build real thinking/i,
    media: /^\/img\/daily-pages-guide\/.+\.mp4$/,
    wont: [
      /send student names to the tutor/i,
      /grade an entry until you ask it to/i,
      /grade grammar when you turn grammar grading off/i,
    ],
  },
  {
    name: 'Class Starter',
    typeId: (ctx: E2EContext) => ctx.classStarterAssignmentTypeId,
    heading: /get every student writing/i,
    media: /^\/img\/class-starter-guide\/.+\.mp4$/,
    wont: [
      /grade grammar or mark up the writing/i,
      /send student names to the tutor/i,
      /send student writing to the prompt generator/i,
    ],
  },
];

for (const guide of GUIDES) {
  test.describe(`${guide.name}: See how it works`, () => {
    test('opens the guide from the assignment type page and comes back', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const pagePath = `/app/assignment-types/${guide.typeId(e2eContext)}`;
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(pagePath);

      await page.getByRole('link', { name: 'See how it works' }).click();
      await expect(page).toHaveURL(new RegExp(`${pagePath}/how-it-works$`));

      await expect(
        page.getByRole('heading', { level: 1, name: guide.heading })
      ).toBeVisible();
      // The section a school approving it reads first.
      const wont = page.getByTestId('guide-wont');
      for (const line of guide.wont) await expect(wont).toContainText(line);
      // The clips are served from the app, not an outside site.
      await expect(page.locator('video source').first()).toHaveAttribute(
        'src',
        guide.media
      );

      await page
        .getByRole('link', { name: new RegExp(`back to ${guide.name}`, 'i') })
        .click();
      await expect(page).toHaveURL(new RegExp(`${pagePath}$`));
    });

    test('keeps the guide teacher-only', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
      await page.goto(
        `/app/assignment-types/${guide.typeId(e2eContext)}/how-it-works`
      );
      await expect(page).toHaveURL(/\/app(?!\/assignment-types)/);
    });

    test('keeps the guide in bounds on a phone', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const pagePath = `/app/assignment-types/${guide.typeId(e2eContext)}`;
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.setViewportSize({ width: 390, height: 844 });

      await page.goto(pagePath);
      // Icon only at this width, still named for anyone using a screen reader.
      await expect(
        page.getByRole('link', { name: 'See how it works' })
      ).toBeVisible();

      await page.goto(`${pagePath}/how-it-works`);
      await expect(page.getByTestId('guide-wont')).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
