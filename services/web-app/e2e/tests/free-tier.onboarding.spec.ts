import bcrypt from 'bcryptjs';
import path from 'node:path';
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
    await expect(page.getByRole('heading', { name: "We couldn't open this link" })).toBeVisible();
  });

  test('join page does not treat release token as acquisition token', async ({ page }) => {
    await page.goto('/free/join?t=not-a-real-signed-token');
    await expect(page.getByText(/This invite link isn't valid/i)).toBeVisible();
    await expect(page.getByText(/no longer valid/i)).not.toBeVisible();
  });

  test('join page shows YAWP branding when token is invalid', async ({ page }) => {
    await page.goto('/free/join?t=not-a-real-signed-token');
    await expect(page.getByRole('img', { name: 'Yawp', exact: true })).toBeVisible();
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
    await expect(page.getByRole('img', { name: 'Yawp', exact: true })).toBeVisible();
    await page.fill('input[name="name"]', teacherName);
    await page.fill('input[name="password"]', JOIN_PASSWORD);
    await page.fill('input[name="confirmPassword"]', JOIN_PASSWORD);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForURL('**/app/free-tier/onboarding**', { timeout: 30_000 });
    expect(page.url()).not.toMatch(/\/auth\/login/);

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
    await adminPage.getByRole('checkbox', { name: /I can approve classroom software/i }).check();
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
    expect(page.url()).not.toMatch(/\/auth\/login/);

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

  test('self administrator is rejected inline and by direct POST before any approval writes', async ({ page }) => {
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
    expect(page.url()).not.toMatch(/\/auth\/login/);

    await page.fill('input[name="adminName"]', 'Same Person');
    await page.fill('input[name="adminRole"]', 'Principal');
    const email = page.getByRole('textbox', { name: 'Administrator email' });
    const message = "Use your administrator's email here, not your own.";
    const shots = process.env.SELF_ADMIN_SCREENSHOT_DIR;
    const stage = process.env.SELF_ADMIN_SCREENSHOT_STAGE ?? 'after';
    let posts = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/app/free-tier/onboarding')) posts++;
    });
    for (const adminEmail of [teacherEmail, `  ${teacherEmail.toUpperCase()}  `, `ft-self-${stamp}+alias@${ADMIN_DOMAIN}`]) {
      await email.fill(adminEmail);
      await email.blur();
      if (shots) await page.screenshot({ path: path.join(shots, `${stage}-self-${adminEmail.includes('+') ? 'alias' : 'exact'}.png`), mask: [email] });
      await expect(email).toHaveAttribute('aria-invalid', 'true');
      await expect(email).toHaveAccessibleDescription(message);
      await page.getByRole('button', { name: /Send approval request/i }).click();
      await expect(page).toHaveURL(/\/app\/free-tier\/onboarding/);
      expect(posts).toBe(0);
    }

    const before = await prisma.freeTierApplication.findUnique({ where: { id: app.id } });
    for (const adminEmail of [teacherEmail, `ft-self-${stamp}+bypass@${ADMIN_DOMAIN}`]) {
      const response = await page.request.post('/app/free-tier/onboarding', {
        form: { adminName: 'Same Person', adminEmail, adminRole: 'Principal', teacherEmail: 'spoofed@other.org' },
      });
      expect(response.status()).toBe(400);
      expect(await response.text()).toContain(message.replaceAll("'", '&#x27;'));
    }
    expect(await prisma.freeTierApplication.findUnique({ where: { id: app.id } })).toEqual(before);
    expect(await prisma.freeTierAdminApproval.count({ where: { applicationId: app.id } })).toBe(0);
    expect(await prisma.freeTierEmailLog.count({ where: { applicationId: app.id, kind: 'admin_approval' } })).toBe(0);
    expect(await prisma.freeTierSignedLink.count({ where: { applicationId: app.id, purpose: 'ADMIN_APPROVE' } })).toBe(0);

    await email.fill(`principal@${ADMIN_DOMAIN}`);
    await expect(email).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    if (shots) await page.screenshot({ path: path.join(shots, `${stage}-distinct-control.png`), mask: [email] });
    await page.getByRole('button', { name: /Send approval request/i }).click();
    await page.waitForURL('**/app/free-tier/pending**');
    expect((await prisma.freeTierApplication.findUnique({ where: { id: app.id } }))?.status).toBe('SENT');
    // E2E delivery is captured locally by the existing mail fixture.
    expect(await prisma.freeTierEmailLog.count({ where: { applicationId: app.id, kind: 'admin_approval', success: true } })).toBe(1);
    await prisma.$disconnect();
  });

  test('approved teacher with only archived class reaches my-classes without redirect loop', async ({
    page,
    signIn,
  }) => {
    const prisma = createE2EPrismaClient();
    const stamp = Date.now();
    const teacherEmail = `ft-archived-${stamp}@${ADMIN_DOMAIN}`;
    const passwordHash = bcrypt.hashSync(JOIN_PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: teacherEmail,
        name: 'Archived Class Teacher',
        password: { create: { hash: passwordHash } },
      },
    });
    const org = await prisma.organization.create({
      data: {
        name: 'FT Archived Org',
        plan: 'FREE_CLASSROOM',
        planActivatedAt: new Date(),
        numOfStudentSeats: 35,
        numOfTeacherSeats: 1,
      },
    });
    const school = await prisma.school.create({
      data: { organizationId: org.id, name: 'Archived High', code: `ft-arch-${stamp}` },
    });
    const membership = await prisma.orgMembership.create({
      data: {
        userId: user.id,
        organizationId: org.id,
        role: 'TEACHER',
        isOrgOwner: true,
        schools: { connect: { id: school.id } },
      },
    });
    await prisma.class.create({
      data: {
        schoolId: school.id,
        schoolYear: '2025-2026',
        title: 'Archived Class',
        code: `ARC${stamp}`.slice(0, 12),
        isArchived: true,
        teachers: { connect: { id: membership.id } },
      },
    });
    await prisma.freeTierApplication.create({
      data: {
        email: teacherEmail,
        name: 'Archived Class Teacher',
        schoolName: 'Archived High',
        location: 'E2E',
        gradeLevel: '10',
        status: 'APPROVED',
        userId: user.id,
        organizationId: org.id,
        releasedAt: new Date(),
      },
    });

    await signIn(teacherEmail, JOIN_PASSWORD);
    const response = await page.goto('/app/my-classes', { waitUntil: 'domcontentloaded' });
    expect(response?.ok()).toBe(true);
    await expect(page).toHaveURL(/\/app\/my-classes/);
    await expect(page.getByText(/too many redirects/i)).not.toBeVisible();
  });

  test('paid-school teacher regression: no free-tier gate', async ({ page, signIn, e2eContext }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/my-classes');
    await expect(page).toHaveURL(/\/app\/my-classes/);
    await expect(page).not.toHaveURL(/free-tier/);
    await expect(page.getByTestId('app._index').or(page.locator('main'))).toBeVisible();
  });
});
