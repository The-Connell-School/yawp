import { expect, test } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { waitForFreeTierEmailPayload } from '../helpers/free-tier-email';
import { mintFreeTierLinkForE2E } from '../helpers/mint-free-tier-link';

const JOIN_PASSWORD = 'yawp-e2e-pass-1';
const ADMIN_DOMAIN = 'e2e-ft.school.edu';

test.describe('Free tier public flow', () => {
  test('waitlist page loads', async ({ page }) => {
    await page.goto('/free');
    await expect(page.getByRole('heading', { name: /Try YAWP/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Join the waitlist/i })).toBeVisible();
  });

  test('waitlist form submits', async ({ page }) => {
    await page.goto('/free');
    await page.fill('input[name="name"]', 'E2E Waitlist');
    await page.fill('input[name="email"]', `e2e-waitlist+${Date.now()}@yawp.local`);
    await page.fill('input[name="schoolName"]', 'E2E High');
    await page.fill('input[name="location"]', 'Local');
    await page.fill('input[name="gradeLevel"]', '10');
    await page.getByRole('button', { name: /Join the waitlist/i }).click();
    await expect(page.getByRole('status')).toContainText(/on the list/i);
  });

  test('admin approve page rejects missing token', async ({ page }) => {
    await page.goto('/free/admin/approve');
    await expect(page.getByText(/not valid|expired/i)).toBeVisible();
  });

  test('join page does not treat release token as acquisition token', async ({ page }) => {
    await page.goto('/free/join?t=not-a-real-signed-token');
    await expect(page.getByText(/This link is not valid/i)).toBeVisible();
    await expect(page.getByText(/no longer valid/i)).not.toBeVisible();
  });

  test('join page shows YAWP branding when token is invalid', async ({ page }) => {
    await page.goto('/free/join?t=not-a-real-signed-token');
    await expect(page.getByRole('link', { name: /YAWP/i })).toBeVisible();
  });
});

test.describe.serial('Free tier teacher onboarding (full path)', () => {
  test.setTimeout(180_000);

  test('join → onboarding → emailed approve link → class → AI unlocked', async ({ page, browser }) => {
    const prisma = createE2EPrismaClient();
    const stamp = Date.now();
    const teacherEmail = `ft-teacher-${stamp}@${ADMIN_DOMAIN}`;
    const teacherName = 'FT E2E Teacher';
    const schoolName = `FT E2E High ${stamp}`;

    const app = await prisma.freeTierApplication.create({
      data: {
        email: teacherEmail,
        name: teacherName,
        schoolName,
        location: 'E2E',
        gradeLevel: '10',
        status: 'INVITED',
        releasedAt: new Date(),
      },
    });

    const releaseMint = await mintFreeTierLinkForE2E(prisma, {
      applicationId: app.id,
      purpose: 'RELEASE',
    });

    await page.goto(`/free/join?t=${encodeURIComponent(releaseMint.token)}`);
    await expect(page.getByRole('link', { name: /YAWP/i })).toBeVisible();
    await page.fill('input[name="name"]', teacherName);
    await page.fill('input[name="password"]', JOIN_PASSWORD);
    await page.fill('input[name="confirmPassword"]', JOIN_PASSWORD);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForURL('**/app/free-tier/onboarding**', { timeout: 30_000 });

    await page.fill('input[name="adminName"]', 'E2E Principal');
    await page.fill('input[name="adminEmail"]', `principal@${ADMIN_DOMAIN}`);
    await page.fill('input[name="adminRole"]', 'Principal');
    await page.getByRole('button', { name: /Send approval request/i }).click();
    await page.waitForURL('**/app/free-tier/pending**', { timeout: 30_000 });

    const emailPayload = await waitForFreeTierEmailPayload(prisma, {
      applicationId: app.id,
      kind: 'admin_approval',
    });
    const approveUrl = emailPayload.approveUrl;
    expect(approveUrl).toBeTruthy();

    const adminPage = await browser.newPage();
    await adminPage.goto(approveUrl!);
    await adminPage.fill('input[name="adminRole"]', 'Principal');
    await adminPage.getByRole('checkbox', { name: /authorized/i }).check();
    await adminPage.getByRole('button', { name: /Approve YAWP/i }).click();
    await expect(adminPage.getByRole('heading', { name: /Thank you/i })).toBeVisible({
      timeout: 30_000,
    });
    await adminPage.close();

    await page.goto('/app/my-classes');
    await page.waitForURL('**/app/my-classes**', { timeout: 45_000 });
    await expect(page.locator('main')).toBeVisible();

    const updated = await prisma.freeTierApplication.findUnique({
      where: { id: app.id },
      select: { status: true, organizationId: true },
    });
    expect(updated?.status).toBe('APPROVED');
    expect(updated?.organizationId).toBeTruthy();

    const org = await prisma.organization.findUnique({
      where: { id: updated!.organizationId! },
      select: { id: true, plan: true },
    });
    expect(org?.plan).toBe('FREE_CLASSROOM');

    const classCount = await prisma.class.count({
      where: {
        isArchived: false,
        teachers: { some: { user: { email: teacherEmail } } },
      },
    });
    expect(classCount).toBeGreaterThan(0);

    const approvedApp = await prisma.freeTierApplication.findFirst({
      where: { organizationId: org!.id, status: 'APPROVED' },
      select: { id: true },
    });
    expect(approvedApp?.id).toBeTruthy();
  });

  test('not-right-person forward succeeds and emails new admin', async ({ page, browser }) => {
    const prisma = createE2EPrismaClient();
    const stamp = Date.now();
    const teacherEmail = `ft-forward-${stamp}@${ADMIN_DOMAIN}`;
    const teacherName = 'FT Forward Teacher';
    const schoolName = `FT Forward High ${stamp}`;

    const app = await prisma.freeTierApplication.create({
      data: {
        email: teacherEmail,
        name: teacherName,
        schoolName,
        location: 'E2E',
        gradeLevel: '10',
        status: 'INVITED',
        releasedAt: new Date(),
      },
    });

    const releaseMint = await mintFreeTierLinkForE2E(prisma, {
      applicationId: app.id,
      purpose: 'RELEASE',
    });

    await page.goto(`/free/join?t=${encodeURIComponent(releaseMint.token)}`);
    await page.fill('input[name="name"]', teacherName);
    await page.fill('input[name="password"]', JOIN_PASSWORD);
    await page.fill('input[name="confirmPassword"]', JOIN_PASSWORD);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForURL('**/app/free-tier/onboarding**', { timeout: 30_000 });

    await page.fill('input[name="adminName"]', 'Wrong Admin');
    await page.fill('input[name="adminEmail"]', `wrong-${stamp}@${ADMIN_DOMAIN}`);
    await page.fill('input[name="adminRole"]', 'Principal');
    await page.getByRole('button', { name: /Send approval request/i }).click();
    await page.waitForURL('**/app/free-tier/pending**', { timeout: 30_000 });

    const emailPayload = await waitForFreeTierEmailPayload(prisma, {
      applicationId: app.id,
      kind: 'admin_approval',
    });
    const declineUrl = emailPayload.notRightPersonUrl;
    expect(declineUrl).toBeTruthy();

    const forwardPage = await browser.newPage();
    await forwardPage.goto(declineUrl!);
    await forwardPage.fill('input[name="adminName"]', 'E2E Principal');
    await forwardPage.fill('input[name="adminEmail"]', `principal-${stamp}@${ADMIN_DOMAIN}`);
    await forwardPage.getByRole('button', { name: /Forward request/i }).click();
    await expect(forwardPage.getByRole('heading', { name: /Request forwarded/i })).toBeVisible({
      timeout: 30_000,
    });
    await forwardPage.close();

    const pending = await prisma.freeTierAdminApproval.findFirst({
      where: { applicationId: app.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    expect(pending?.adminEmail).toBe(`principal-${stamp}@${ADMIN_DOMAIN}`);
  });

  test('self-approval alias routes to manual review (no admin email)', async ({ page }) => {
    const prisma = createE2EPrismaClient();
    const stamp = Date.now();
    const teacherEmail = `ft-self-${stamp}@${ADMIN_DOMAIN}`;
    const app = await prisma.freeTierApplication.create({
      data: {
        email: teacherEmail,
        name: 'Self E2E',
        schoolName: 'Self High',
        location: 'E2E',
        gradeLevel: '11',
        status: 'INVITED',
        releasedAt: new Date(),
      },
    });
    const releaseMint = await mintFreeTierLinkForE2E(prisma, {
      applicationId: app.id,
      purpose: 'RELEASE',
    });

    await page.goto(`/free/join?t=${encodeURIComponent(releaseMint.token)}`);
    await page.fill('input[name="name"]', 'Self E2E');
    await page.fill('input[name="password"]', JOIN_PASSWORD);
    await page.fill('input[name="confirmPassword"]', JOIN_PASSWORD);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForURL('**/app/free-tier/onboarding**', { timeout: 30_000 });

    await page.fill('input[name="adminName"]', 'Same Person');
    await page.fill('input[name="adminEmail"]', `ft-self-${stamp}+alias@${ADMIN_DOMAIN}`);
    await page.fill('input[name="adminRole"]', 'Principal');
    await page.getByRole('button', { name: /Send approval request/i }).click();
    await page.waitForURL('**/app/free-tier/pending**', { timeout: 30_000 });
    await expect(page.getByText(/reviewing this request manually/i)).toBeVisible();

    const sent = await prisma.freeTierEmailLog.findFirst({
      where: { applicationId: app.id, kind: 'admin_approval', success: true },
    });
    expect(sent).toBeNull();

    const finalApp = await prisma.freeTierApplication.findUnique({ where: { id: app.id } });
    expect(finalApp?.status).toBe('MANUAL_REVIEW');
  });

  test('paid-school teacher regression: no free-tier gate', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/my-classes');
    await expect(page).toHaveURL(/\/app\/my-classes/);
    await expect(page).not.toHaveURL(/free-tier/);
    await expect(page.getByTestId('app._index').or(page.locator('main'))).toBeVisible();
  });
});
