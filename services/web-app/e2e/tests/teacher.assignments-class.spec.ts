import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setAssignmentsForOrganization } from '../db-helpers';

test.describe.serial('Teacher class assignments', () => {
  test('creates assignment and sees it in the list', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await setAssignmentsForOrganization({
        prisma,
        organizationId: e2eContext.organizationId,
        enabled: true,
      });

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/my-classes/${e2eContext.classId}`);
      await page.waitForLoadState('networkidle');

      await page.getByRole('tab', { name: /assignments/i }).click();
      await page.getByRole('button', { name: /new assignment/i }).click();

      await expect(
        page.getByRole('heading', { name: /new assignment/i })
      ).toBeVisible();

      const uniqueTitle = `E2E Assignment ${Date.now()}`;
      await page.getByLabel(/title \(optional\)/i).fill(uniqueTitle);
      await page
        .getByLabel(/^prompt$/i)
        .fill(
          'Write a five-paragraph essay about the cold Dutch sea. Be specific.'
        );

      await page.getByRole('button', { name: /^create assignment$/i }).click();

      await expect(
        page.getByRole('heading', { name: /new assignment/i })
      ).toHaveCount(0, { timeout: 15000 });

      await expect(page.getByText(uniqueTitle, { exact: true })).toBeVisible();

      const assign = await prisma.assignment.findFirst({
        where: { classId: e2eContext.classId, title: uniqueTitle },
        select: { id: true, prompt: true },
      });
      expect(assign).not.toBeNull();
      expect(assign?.prompt).toContain('five-paragraph');
    } finally {
      await prisma.$disconnect();
    }
  });
});
