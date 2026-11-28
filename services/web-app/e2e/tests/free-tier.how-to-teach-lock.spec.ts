import { expect, test } from '../test-setup';
import { setFreeTierFlag, setFeatureFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const FREE_TEACHER_EMAIL =
  process.env.E2E_FREE_CLASSROOM_TEACHER_EMAIL ?? 'dev.teacher.free@yawp.local';
const FREE_TEACHER_PASSWORD = 'yawp-dev';

test.describe('free tier: locked assignment type How to Teach It', () => {
  test.beforeEach(async () => {
    await setFreeTierFlag(true);
    await setFeatureFlag('assignment-type-landing-v2', true);
  });

  test('free teachers can fetch Pre-writing and Thesis Statement files only', async ({
    page,
    signIn,
  }) => {
    await signIn(FREE_TEACHER_EMAIL, FREE_TEACHER_PASSWORD);
    expect(
      (
        await page.request.get(
          '/courses/thesis-driven-essay/01-introduction-to-yawp.pptx'
        )
      ).status()
    ).toBe(403);
    expect(
      (
        await page.request.get('/courses/thesis-driven-essay/02-pre-writing.pptx')
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.get(
          '/courses/thesis-driven-essay/03-develop-your-thesis-statement.pptx'
        )
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.get(
          '/courses/thesis-driven-essay/tutorials/02-pre-writing.mp4'
        )
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.get(
          '/courses/thesis-driven-essay/tutorials/05-body-paragraphs.mp4'
        )
      ).status()
    ).toBe(403);
  });

  test('thesis-driven essay How to Teach It shows the license popover and blocks course files', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const type = await prisma.assignmentType.findFirst({
      where: {
        archivedAt: null,
        title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' },
      },
      select: { id: true },
    });
    await prisma.$disconnect();
    if (!type) test.skip();

    await signIn(FREE_TEACHER_EMAIL, FREE_TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${type!.id}`);
    await expect(page.getByRole('link', { name: 'See how it works' })).toBeVisible();
    await page.getByRole('link', { name: 'See how it works' }).click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    await expect(page.getByTestId('how-to-teach-site-license-locked')).toBeVisible();

    await page.goto(`/app/assignment-types/${type!.id}`);
    await expect(page.getByTestId('how-to-teach-site-license-locked')).toBeVisible();
    const lockedSection = page.getByTestId('how-to-teach-site-license-locked');
    await lockedSection.click();
    const popover = page.getByTestId('how-to-teach-license-popover');
    await expect(popover).toContainText('Comes with a school site license.');
    await expect(popover).toBeInViewport();

    const tutorial = await page.request.get(
      `/app/assignment-types/${type!.id}/tutorial/2`
    );
    expect(tutorial.status()).toBe(403);
    const response = await page.request.get(
      '/courses/thesis-driven-essay/01-introduction-to-yawp.pptx'
    );
    expect(response.status()).toBe(403);
    // Pre-writing and Thesis Statement are in the free bundle, and their pages
    // link these files unlocked.
    const preWritingDeck = await page.request.get(
      '/courses/thesis-driven-essay/02-pre-writing.pptx'
    );
    expect(preWritingDeck.status()).toBe(200);
    const thesisDeck = await page.request.get(
      '/courses/thesis-driven-essay/03-develop-your-thesis-statement.pptx'
    );
    expect(thesisDeck.status()).toBe(200);
  });

  test('how-it-works GuideHowToTeach is locked for thesis-driven essay', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const type = await prisma.assignmentType.findFirst({
      where: {
        archivedAt: null,
        title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' },
      },
      select: { id: true },
    });
    await prisma.$disconnect();
    if (!type) test.skip();

    await signIn(FREE_TEACHER_EMAIL, FREE_TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${type!.id}/how-it-works`);
    await expect(page.getByTestId('how-to-teach-site-license-locked')).toBeVisible();
  });
});
