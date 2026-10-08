import fs from 'node:fs';
import path from 'node:path';
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

// A how-to guide in the shape docs/how-to-guides.md describes.
const GUIDE_STORYBOARD = {
  slug: 'e2e-dashboard-guide',
  title: 'E2E dashboard guide',
  persona: 'teacher',
  viewport: 'desktop',
  guide: {
    headline: 'See every class at a glance.',
    highlight: 'at a glance.',
    lede: 'Your dashboard shows each class and the work waiting for you.',
    will: ['Show the classes you teach.'],
    wont: ['Show one student another student’s work.'],
    footerNote: 'Screens use demo classes.',
  },
  scenes: [
    { id: 'hero', goto: '/app', waitFor: 'main', guide: { section: 'hero' } },
    {
      id: 'student-work',
      goto: '/app/student-work',
      waitFor: 'main',
      guide: {
        section: 'step',
        heading: 'Open student work',
        body: 'Everything turned in, in one list.',
      },
    },
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
    await deleteJobsForSlug(GUIDE_STORYBOARD.slug);
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

  // The guide is the studio's lead deliverable: it is what a school forwards.
  test('offers a how-to guide first and queues a pasted guide', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/marketing-media');

    await expect(
      page.getByRole('button', { name: /How-to guide/ })
    ).toHaveAttribute('aria-pressed', 'true');

    await page
      .getByLabel('What should this show?')
      .fill('E2E: a how-to guide for the teacher dashboard.');
    await page.getByRole('button', { name: /paste a storyboard/i }).click();
    await page
      .getByLabel('Storyboard JSON')
      .fill(JSON.stringify(GUIDE_STORYBOARD));
    await page.getByRole('button', { name: 'Queue render' }).click();

    await page.waitForURL('**/app/admin/marketing-media/**', {
      timeout: 30_000,
    });
    await expect(page.getByText('How-to guide').first()).toBeVisible();
    await expect(page.getByTestId('marketing-job-status')).toHaveText('QUEUED');
  });

  test('rejects a pasted guide with no will / won’t lists', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto('/app/admin/marketing-media');

    await page
      .getByLabel('What should this show?')
      .fill('E2E: a guide missing its shape.');
    await page.getByLabel('Deliverable').selectOption('GUIDE');
    await page.getByRole('button', { name: /paste a storyboard/i }).click();
    await page.getByLabel('Storyboard JSON').fill(
      JSON.stringify({
        ...GUIDE_STORYBOARD,
        slug: 'e2e-bad-guide',
        guide: { ...GUIDE_STORYBOARD.guide, will: [], wont: [] },
      })
    );
    await page.getByRole('button', { name: 'Queue render' }).click();

    await expect(page.getByTestId('marketing-form-error')).toContainText(
      'won’t do'
    );
  });

  test('shows a finished guide as the page readers will see', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    const prisma = createE2EPrismaClient();
    let jobId: string;
    try {
      const admin = await prisma.user.findFirstOrThrow({
        where: { email: 'admin.e2e@yawp.test' },
        select: { id: true },
      });
      const job = await prisma.marketingMediaJob.create({
        data: {
          createdById: admin.id,
          kind: 'GUIDE',
          status: 'SUCCEEDED',
          brief: 'E2E: a finished guide.',
          storyboard: GUIDE_STORYBOARD,
          finishedAt: new Date(),
        },
        select: { id: true },
      });
      jobId = job.id;
      const key = `marketing-media/${job.id}/${GUIDE_STORYBOARD.slug}.html`;
      const mediaDir = process.env.MARKETING_MEDIA_DIR!;
      fs.mkdirSync(path.join(mediaDir, path.dirname(key)), { recursive: true });
      const html =
        '<!doctype html><title>Guide</title><h1>See every class at a glance.</h1>';
      fs.writeFileSync(path.join(mediaDir, key), html);
      await prisma.marketingMediaJob.update({
        where: { id: job.id },
        data: {
          outputs: [
            {
              kind: 'DOCUMENT',
              key,
              contentType: 'text/html; charset=utf-8',
              bytes: html.length,
              label: 'See every class at a glance.',
            },
          ],
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await page.goto(`/app/admin/marketing-media/${jobId}`);

    const guide = page.getByTestId('marketing-guide-document');
    await expect(guide).toBeVisible();
    await expect(
      page
        .frameLocator('iframe[title="See every class at a glance."]')
        .getByRole('heading', { name: 'See every class at a glance.' })
    ).toBeVisible();
    await expect(
      guide.getByRole('link', { name: 'Open full page' })
    ).toHaveAttribute('href', new RegExp(`/file/${GUIDE_STORYBOARD.slug}.html$`));
    await expect(guide).toContainText('Before you share it');
  });
});
