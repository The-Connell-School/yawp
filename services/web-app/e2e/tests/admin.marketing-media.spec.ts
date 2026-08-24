import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

const STORYBOARD = {
  slug: 'e2e-teacher-loop',
  title: 'E2E teacher loop',
  audience: 'Department chairs',
  persona: 'teacher',
  viewport: 'desktop',
  scenes: [
    {
      id: 'dashboard',
      goto: '/app',
      waitFor: 'main',
      hold: 1,
      caption: 'Teacher home',
    },
    { id: 'student-work', goto: '/app/student-work', waitFor: 'main', hold: 1 },
  ],
};

async function deleteJobsForSlug(slug: string) {
  const prisma = createE2EPrismaClient();
  try {
    const jobs = await prisma.marketingMediaJob.findMany({
      select: { id: true, storyboard: true },
    });
    const ids = jobs
      .filter(
        (job) => (job.storyboard as { slug?: string } | null)?.slug === slug
      )
      .map((job) => job.id);
    if (ids.length > 0) {
      await prisma.marketingMediaJob.deleteMany({ where: { id: { in: ids } } });
    }
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Admin Marketing Studio', () => {
  test.setTimeout(90_000);

  test.afterAll(async () => {
    await deleteJobsForSlug(STORYBOARD.slug);
  });

  test('is not reachable by a teacher', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/admin/marketing-media');

    await expect(
      page.getByRole('heading', { name: 'Marketing Studio' })
    ).toHaveCount(0);
  });

  test('queues a job from a pasted storyboard and shows it on the job page', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/marketing-media');

    await expect(
      page.getByRole('heading', { name: 'Marketing Studio' })
    ).toBeVisible();

    await page
      .getByLabel('What should this show?')
      .fill('E2E: teacher reviewing submitted student work.');
    await page.getByLabel('Audience').fill('Department chairs');
    await page.getByLabel('Deliverable').selectOption('STILLS');

    await page.getByRole('button', { name: /paste a storyboard/i }).click();
    await page.getByLabel('Storyboard JSON').fill(JSON.stringify(STORYBOARD));

    await page.getByRole('button', { name: 'Queue render' }).click();

    await page.waitForURL('**/app/admin/marketing-media/**', {
      timeout: 30_000,
    });

    await expect(
      page.getByRole('heading', { name: 'E2E teacher loop' })
    ).toBeVisible();
    await expect(page.getByTestId('marketing-job-status')).toHaveText('QUEUED');
    await expect(page.getByTestId('marketing-job-scene')).toHaveCount(2);
    await expect(page.getByTestId('marketing-job-scene').nth(1)).toContainText(
      '/app/student-work'
    );
  });

  test('lists the queued job and cancels it', async ({ page, signIn }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/marketing-media');

    const row = page.getByRole('row', { name: /E2E teacher loop/ }).first();
    await expect(row).toBeVisible();
    await row.getByRole('link', { name: /open/i }).click();

    await page.waitForURL('**/app/admin/marketing-media/**');
    await page.getByRole('button', { name: 'Cancel job' }).click();

    await expect(page.getByTestId('marketing-job-status')).toHaveText(
      'CANCELLED'
    );
  });

  test('rejects a storyboard that leaves the allowed routes', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/marketing-media');

    await page
      .getByLabel('What should this show?')
      .fill('E2E: off-allowlist storyboard.');
    await page.getByRole('button', { name: /paste a storyboard/i }).click();
    await page.getByLabel('Storyboard JSON').fill(
      JSON.stringify({
        ...STORYBOARD,
        slug: 'e2e-bad-storyboard',
        scenes: [{ id: 'external', goto: 'https://example.com' }],
      })
    );

    await page.getByRole('button', { name: 'Queue render' }).click();

    await expect(page.getByTestId('marketing-form-error')).toContainText(
      'route must be one of'
    );
    // React Router posts index routes to ?index; the point is that it did not redirect.
    await expect(page).toHaveURL(/\/app\/admin\/marketing-media(\?index)?$/);
  });
});
