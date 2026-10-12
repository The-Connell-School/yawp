import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// Run against an isolated E2E server with MOCK_ADMIN_ENABLED=true.
test.describe('Mock admin platform navigation', () => {
  test('grant exposes tester queues without admin privileges', async ({ page, signIn, e2eContext }) => {
    test.skip(process.env.MOCK_ADMIN_ENABLED !== 'true', 'Requires tester-enabled E2E server');
    const prisma = createE2EPrismaClient();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: e2eContext.teacherEmail } });
    try {
      await prisma.user.update({ where: { id: user.id }, data: { mockAdminGranted: true } });
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto('/app');
      await page.getByRole('link', { name: 'Tester queues' }).click();
      await expect(page.getByRole('heading', { name: 'Tester waitlist' })).toBeVisible();
      await page.getByRole('link', { name: 'Approval queue', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Tester approvals' })).toBeVisible();
      const current = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(current.isAdmin).toBe(user.isAdmin);
      expect(current.isSuperAdmin).toBe(user.isSuperAdmin);
      await prisma.user.update({ where: { id: user.id }, data: { mockAdminGranted: false } });
      expect((await page.goto('/app/tester/approvals'))?.status()).toBe(403);
      await page.goto('/app');
      await expect(page.getByRole('link', { name: 'Tester queues' })).toHaveCount(0);
    } finally {
      await prisma.user.update({ where: { id: user.id }, data: { mockAdminGranted: user.mockAdminGranted } });
      await prisma.$disconnect();
    }
  });
});
