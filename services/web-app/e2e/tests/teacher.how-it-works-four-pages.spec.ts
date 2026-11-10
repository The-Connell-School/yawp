import { test, expect } from '../test-setup';
import type { E2EContext } from '../seed-e2e';
import { setFeatureFlag } from '../feature-flags';
import { ensureWritingStepType } from '../fixtures/writing-step-types';

// The four How It Works pages, finalized (Kevin, Nov 10): each opens with its
// overview video under the headline, then How to Teach It, collapsible, on a
// white card, behind `assignment-type-landing-v2`. Exit Ticket's guide is new
// and exists only with the flag on.

const TEACHER_PASSWORD = 'teacher-e2e-password';

type Guide = {
  name: string;
  typeId: (ctx: E2EContext) => Promise<string>;
  heading: RegExp;
  video: string;
};

const GUIDES: Guide[] = [
  {
    name: 'Class Starter',
    typeId: async (ctx) => ctx.classStarterAssignmentTypeId,
    heading: /get every student writing at the start of class/i,
    video: '/img/class-starter-guide/overview.mp4',
  },
  {
    name: 'Pre-Writing',
    typeId: (ctx) => ensureWritingStepType(ctx.organizationId, 'prewriting'),
    heading: /teach prewriting/i,
    video: '/img/prewriting-guide/overview.mp4',
  },
  {
    name: 'Thesis Statement',
    typeId: (ctx) => ensureWritingStepType(ctx.organizationId, 'thesis_statement'),
    heading: /teach thesis statement/i,
    video: '/img/thesis-statement-guide/overview.mp4',
  },
  {
    name: 'Exit Ticket',
    typeId: async (ctx) => ctx.exitTicketAssignmentTypeId,
    heading: /find out if today’s lesson landed/i,
    video: '/img/exit-ticket-guide/overview.mp4',
  },
];

test.describe.serial('How It Works: the four pages, finalized', () => {
  test.afterAll(async () => {
    await setFeatureFlag('assignment-type-landing-v2', false);
  });

  for (const guide of GUIDES) {
    test(`${guide.name}: See how it works opens the video, then How to Teach It`, async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setFeatureFlag('assignment-type-landing-v2', true);
      const pagePath = `/app/assignment-types/${await guide.typeId(e2eContext)}`;
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(pagePath);

      await page.getByRole('link', { name: 'See how it works' }).click();
      await expect(page).toHaveURL(new RegExp(`${pagePath}/how-it-works$`));
      await expect(page.getByRole('heading', { level: 1, name: guide.heading })).toBeVisible();

      // The video is the first on the page, it waits for the teacher, and
      // the file is served by the app.
      const video = page.getByTestId('guide-overview-video').locator('video');
      await expect(video).toBeVisible();
      await expect(page.locator('video').first()).toHaveAttribute('controls', '');
      await expect(page.locator('video source').first()).toHaveAttribute('src', guide.video);
      const served = await page.request.get(guide.video);
      expect(served.status()).toBe(200);
      expect(served.headers()['content-type']).toContain('video/mp4');

      // How to Teach It comes right after it, open; Hide folds it, Show
      // brings it back.
      const howTo = page.getByTestId('how-to-teach-spotlight');
      await expect(howTo.getByRole('heading', { name: 'How to Teach It' })).toBeVisible();
      const videoBox = await video.boundingBox();
      const howToBox = await howTo.boundingBox();
      expect(howToBox!.y).toBeGreaterThan(videoBox!.y + videoBox!.height);
      await howTo.getByRole('button', { name: 'Hide How to Teach It' }).click();
      await expect(howTo.getByTestId('how-to-teach-preview')).toBeVisible();
      await howTo.getByRole('button', { name: 'Show How to Teach It' }).click();
      await expect(howTo.getByTestId('how-to-teach-preview')).toHaveCount(0);

      await page.getByRole('link', { name: new RegExp(`back to ${guide.name.replace('-', '-?')}`, 'i') }).first().click();
      await expect(page).toHaveURL(new RegExp(`${pagePath}$`));
    });
  }

  test('Exit Ticket: no guide and no link while the landing pages are off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', false);
    const pagePath = `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`;
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(pagePath);
    await expect(page.getByRole('link', { name: 'See how it works' })).toHaveCount(0);

    await page.goto(`${pagePath}/how-it-works`);
    await expect(page).toHaveURL(new RegExp(`${pagePath}$`));
  });

  test('Class Starter keeps its old guide while the landing pages are off', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag('assignment-type-landing-v2', false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}/how-it-works`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByTestId('guide-overview-video')).toHaveCount(0);
    await expect(page.getByTestId('how-to-teach-spotlight')).toHaveCount(0);
  });

  test('the Exit Ticket guide stays teacher-only', async ({ page, signIn, e2eContext }) => {
    await setFeatureFlag('assignment-type-landing-v2', true);
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}/how-it-works`);
    await expect(page).toHaveURL(/\/app(?!\/assignment-types)/);
  });
});
