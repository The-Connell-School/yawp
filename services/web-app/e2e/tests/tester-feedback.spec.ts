import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// Run against the isolated E2E server with TESTER_FEEDBACK_ENABLED=true.
test.describe.serial('Tester feedback', () => {
  test('flagged tester can submit on mobile; unflagged users cannot see the widget', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: e2eContext.teacherEmail },
    });
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { isTester: false },
      });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app/assignments');
      await expect(
        page.getByRole('button', { name: 'Log feedback' })
      ).toHaveCount(0);
      await prisma.user.update({
        where: { id: user.id },
        data: { isTester: true },
      });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/assignments?tab=work&access_token=test-secret');
      const trigger = page.getByRole('button', { name: 'Log feedback' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Log feedback' });
      await expect(dialog).toBeVisible();
      await dialog
        .getByLabel('What I did')
        .fill('E2E feedback: opened assignments');
      await dialog.getByLabel('What happened').fill('The list loaded slowly');
      await dialog.getByLabel('What I wish it did').fill('Show progress');
      await dialog.getByLabel('Severity').selectOption('low');
      await dialog.getByRole('button', { name: 'Save feedback' }).click();
      await expect(dialog.getByRole('status')).toHaveText(
        'Feedback saved. Thank you.'
      );
      const saved = await prisma.testerFeedback.findFirstOrThrow({
        where: {
          userId: user.id,
          whatIDid: 'E2E feedback: opened assignments',
        },
      });
      expect(saved.url).toBe('/app/assignments?tab=work');
      expect(saved.severity).toBe('low');
      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.goto('/app/tester/feedback');
      await expect(
        page.getByRole('heading', { name: 'Tester feedback' })
      ).toHaveCount(0);
    } finally {
      await prisma.testerFeedback.deleteMany({
        where: {
          userId: user.id,
          whatIDid: 'E2E feedback: opened assignments',
        },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { isTester: user.isTester },
      });
      await prisma.$disconnect();
    }
  });
  test('admin sees the deprecated platform review entry', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: e2eContext.teacherEmail },
    });
    let feedbackId: string | undefined;
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: true },
      });
      const entry = await prisma.testerFeedback.create({
        data: {
          userId: user.id,
          url: '/app/assignments',
          userAgent: 'E2E',
          whatIDid: 'E2E admin export',
          whatHappened: 'Loaded',
          whatIWish: 'Faster',
          severity: 'low',
          environment: 'test',
        },
      });
      feedbackId = entry.id;
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        `/app/tester/feedback?userId=${user.id}&environment=test`
      );
      await expect(
        page.getByRole('heading', { name: 'Tester feedback' })
      ).toBeVisible();
      await expect(
        page.getByText('Tester feedback review has moved to Yawp Internal')
      ).toBeVisible();
      await expect(page.getByText('E2E admin export')).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Download CSV' })
      ).toHaveCount(0);
    } finally {
      if (feedbackId)
        await prisma.testerFeedback.delete({ where: { id: feedbackId } });
      await prisma.user.update({
        where: { id: user.id },
        data: { isAdmin: user.isAdmin },
      });
      await prisma.$disconnect();
    }
  });
});
