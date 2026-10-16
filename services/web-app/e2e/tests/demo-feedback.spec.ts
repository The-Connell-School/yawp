import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import path from 'node:path';

const prisma = createE2EPrismaClient();
const evidence = process.env.DEMO_FEEDBACK_EVIDENCE_DIR;
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('local demo note persistence, accessibility, error recovery and disabled gate', async ({
  page,
}) => {
  await page.request.post('/auth/dev-login', {
    form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
  });
  const flag = 'feature_flag.demo-feedback-widget';
  const screenshot = async (name: string) => {
    if (evidence) {
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(evidence, `local-${name}.png`),
        fullPage: true,
        mask: [page.locator('header'), page.locator('nav')],
      });
    }
  };
  const oldFlag = await prisma.setting.findUnique({ where: { name: flag } });
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: 'dev.teacher@yawp.local' },
  });
  try {
    await prisma.setting.upsert({
      where: { name: flag },
      create: { name: flag, value: 'false', valueType: 'boolean' },
      update: { value: 'false' },
    });
    await page.goto('/app/assignments');
    await expect(
      page.getByRole('button', { name: 'Give feedback', exact: true })
    ).toHaveCount(0);
    await screenshot('before-disabled');
    expect(
      (
        await page.request.post('/api/demo-feedback', {
          data: { note: 'blocked', url: '/app', actions: [] },
          headers: { origin: new URL(page.url()).origin },
        })
      ).status()
    ).toBe(404);
    await prisma.setting.update({
      where: { name: flag },
      data: { value: 'true' },
    });
    await page.goto('/app/assignments?token=qa-secret&search=private');
    const trigger = page.getByRole('button', {
      name: 'Give feedback',
      exact: true,
    });
    await expect(trigger).toBeVisible();
    await screenshot('button');
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Give feedback' });
    await expect(panel.getByLabel('Your note')).toBeFocused();
    await expect(
      panel.getByText('/app/assignments', { exact: true })
    ).toBeVisible();
    await screenshot('panel');
    await panel.getByLabel('Your note').fill('Local demo feedback E2E note');
    await screenshot('populated');
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel.getByRole('status')).toHaveText(
      'Feedback saved. Thank you.'
    );
    const entry = await prisma.testerFeedback.findFirstOrThrow({
      where: {
        userId: teacher.id,
        whatHappened: 'Local demo feedback E2E note',
      },
    });
    expect(entry.url).toBe('/app/assignments');
    expect(entry.environment).toBe('demo');
    expect(JSON.parse(entry.whatIDid).length).toBeLessThanOrEqual(5);
    expect(entry.whatIDid).not.toMatch(/qa-secret|private|Local demo feedback/);
    await screenshot('success');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await panel.getByLabel('Your note').fill('Retry keeps my note');
    await page.route('**/api/demo-feedback', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Could not save feedback. Please try again.' },
      })
    );
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel.getByRole('alert')).toHaveText(
      'Could not save feedback. Please try again.'
    );
    await expect(panel.getByLabel('Your note')).toHaveValue(
      'Retry keeps my note'
    );
    await screenshot('error-mobile');
    await page.unroute('**/api/demo-feedback');
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel.getByRole('status')).toHaveText(
      'Feedback saved. Thank you.'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  } finally {
    await prisma.testerFeedback.deleteMany({
      where: {
        userId: teacher.id,
        whatHappened: {
          in: ['Local demo feedback E2E note', 'Retry keeps my note'],
        },
      },
    });
    if (oldFlag)
      await prisma.setting.update({
        where: { name: flag },
        data: { value: oldFlag.value },
      });
    else await prisma.setting.deleteMany({ where: { name: flag } });
  }
});
