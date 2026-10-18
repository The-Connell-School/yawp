import { expect, test } from '../test-setup';
import { setFeatureFlag, setLoungeCommunityFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';
import { TEACHER_CONTACT_US_FLAG } from '../../app/domain/feature-flags/feature-flags';

/**
 * Brian, round 6: Contact Us on the teacher dashboard, not only in the
 * Faculty Lounge. A teacher who never joined the Lounge can still reach the
 * YAWP! team, and the note lands in the same inbox.
 */

const TEACHER_PASSWORD = 'teacher-e2e-password';
const ADMIN_PASSWORD = 'admin-e2e-password';
const MESSAGE = 'From the dashboard: my class roster shows a student twice.';

async function clearContactAndLounge(teacherUserId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.loungeContactMessage.deleteMany({});
    await prisma.loungeProfile.deleteMany({ where: { userId: teacherUserId } });
  } finally {
    await prisma.$disconnect();
  }
}

async function logout(page: import('@playwright/test').Page) {
  await page.goto('about:blank');
  await page.context().clearCookies();
}

test.describe.serial('Contact Us on the teacher dashboard', () => {
  test.afterAll(async () => {
    await setFeatureFlag(TEACHER_CONTACT_US_FLAG, false);
  });

  test('flag off: no button, and the page is not there', async ({ page, signIn, e2eContext }) => {
    await setFeatureFlag(TEACHER_CONTACT_US_FLAG, false);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app');
    await expect(page.getByRole('link', { name: 'Contact Us' })).toHaveCount(0);
    const response = await page.goto('/app/contact');
    expect(response?.status()).toBe(404);
  });

  test('a teacher who never joined the Lounge sends a note from the dashboard, and the team gets it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setFeatureFlag(TEACHER_CONTACT_US_FLAG, true);
    await setLoungeCommunityFlag(false);
    await clearContactAndLounge(e2eContext.teacherUserId);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app');
    await page.getByRole('link', { name: 'Contact Us' }).click();
    await expect(page).toHaveURL(/\/app\/contact/);
    await expect(page.getByRole('heading', { name: 'Contact Us', level: 1 })).toBeVisible();
    await page.getByLabel('Message').fill(MESSAGE);
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByText(/Thanks\. The YAWP! team will get back to you by email\./)).toBeVisible();
    await page.getByRole('link', { name: 'Back to your dashboard' }).click();
    await expect(page).toHaveURL(/\/app$/);

    await logout(page);
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/admin/lounge');
    const messages = page.getByRole('region', { name: 'Messages' });
    await expect(messages.getByText(MESSAGE)).toBeVisible();
    await expect(messages.getByText(e2eContext.teacherEmail)).toBeVisible();
  });
});
