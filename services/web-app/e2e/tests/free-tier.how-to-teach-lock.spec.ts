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
    await expect(page.getByTestId('how-to-teach-site-license-locked')).toBeVisible();
    await page.getByTestId('how-to-teach-site-license-locked').click();
    await expect(page.getByTestId('how-to-teach-license-popover')).toContainText(
      'Comes with a school site license.'
    );
    const response = await page.request.get(
      '/courses/thesis-driven-essay/02-pre-writing.pptx'
    );
    expect(response.status()).toBe(403);
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