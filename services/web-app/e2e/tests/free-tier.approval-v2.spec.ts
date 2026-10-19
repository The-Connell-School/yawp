import { expect, test } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { mkdir } from 'node:fs/promises';
import { createCookieSessionStorage } from 'react-router';

if (
  !process.env.APPROVAL_V2_BASE_URL ||
  !process.env.E2E_DATABASE_URL ||
  !['localhost', '127.0.0.1'].includes(
    new URL(process.env.E2E_DATABASE_URL).hostname
  )
) {
  throw new Error('Use the isolated approval-v2 project profile');
}
const db = createE2EPrismaClient();
const shots = process.env.APPROVAL_V2_EVIDENCE_DIR;
async function flag(mode: 'off' | 'everyone' | 'targeted') {
  await db.setting.upsert({
    where: { name: 'feature_flag.free-tier-onboarding-v2' },
    create: {
      name: 'feature_flag.free-tier-onboarding-v2',
      value: JSON.stringify({ mode, orgIds: ['another-org'] }),
    },
    update: { value: JSON.stringify({ mode, orgIds: ['another-org'] }) },
  });
}
async function capture(page: import('@playwright/test').Page, name: string) {
  if (shots) {
    await mkdir(shots, { recursive: true });
    await page.screenshot({
      path: `${shots}/${name}-impl.png`,
      fullPage: true,
    });
  }
}
const apps: string[] = [];
const users: string[] = [];
async function fixture(page: import('@playwright/test').Page) {
  // Each local browser fixture gets its own IP budget, like a separate teacher.
  const octets = crypto.getRandomValues(new Uint8Array(2));
  await page.context().setExtraHTTPHeaders({
    'x-forwarded-for': `198.18.${octets[0]}.${octets[1]}`,
  });
  const user = await db.user.create({
    data: {
      email: `approval-${crypto.randomUUID()}@example.org`,
      name: 'Ms. Okafor',
      memberships: {
        create: { organizationId: 'default-org', role: 'TEACHER' },
      },
    },
  });
  users.push(user.id);
  const app = await db.freeTierApplication.create({
    data: {
      userId: user.id,
      email: user.email!,
      name: user.name!,
      schoolName: 'Lincoln High',
      location: 'Local',
      gradeLevel: '11',
      status: 'SENT',
    },
  });
  apps.push(app.id);
  const approval = await db.freeTierAdminApproval.create({
    data: {
      applicationId: app.id,
      adminName: 'Dr. Patel',
      adminEmail: 'patel+approval@example.org',
      emailCopyVersionHash: 'test',
      firstSentAt: new Date('2026-10-14T15:02:00Z'),
    },
  });
  const session = await db.session.create({
    data: { userId: user.id, expirationDate: new Date(Date.now() + 3600000) },
  });
  const storage = createCookieSessionStorage({
    cookie: {
      name: 'en_session',
      secrets: process.env.SESSION_SECRET!.split(','),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
  const cookie = await storage.getSession();
  cookie.set('sessionId', session.id);
  await page.context().addCookies([
    {
      name: 'en_session',
      value: (await storage.commitSession(cookie))
        .split(';')[0]
        .slice('en_session='.length),
      url: process.env.APPROVAL_V2_BASE_URL!,
    },
  ]);
  return { app, approval, user };
}
test.beforeEach(async () => {
  await db.organization.upsert({
    where: { id: 'default-org' },
    create: {
      id: 'default-org',
      name: 'Local placeholder',
      plan: 'FREE_CLASSROOM',
    },
    update: { plan: 'FREE_CLASSROOM' },
  });
  await db.setting.upsert({
    where: { name: 'feature_flag.free_tier' },
    create: { name: 'feature_flag.free_tier', value: 'true' },
    update: { value: 'true' },
  });
});
test.afterAll(async () => {
  await flag('off');
  await db.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await db.session.deleteMany({ where: { userId: { in: users } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.$disconnect();
});
for (const width of [1280, 390])
  test(`waiting and forwarding at ${width}`, async ({ page }) => {
    await flag('everyone');
    await page.setViewportSize({ width, height: 960 });
    const fixtureData = await fixture(page);
    await flag('off');
    await page.goto('/app/free-tier/pending');
    await capture(page, `${width}-waiting-before`);
    await flag('everyone');
    await page.reload();
    if (process.env.APPROVAL_V2_BASELINE === '1') {
      await capture(page, `${width}-waiting-before`);
      return;
    }
    await expect(
      page.getByText('Sent to Dr. Patel on October 14')
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Draft an email' })
    ).toHaveAttribute(
      'href',
      /mailto:patel%2Bapproval%40example\.org\?subject=/
    );
    await capture(page, `${width}-waiting`);
    await page.getByText('Not the right person? Forward this request').click();
    await capture(page, `${width}-forward`);
    await page
      .getByRole('button', { name: 'Forward request', exact: true })
      .click();
    await expect(page.getByLabel('Administrator name')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await capture(page, `${width}-forward-validation`);
    await page.getByLabel('Administrator name').fill('Ms. Rivera');
    await page.getByLabel('Administrator email').fill(fixtureData.app.email);
    await page
      .getByRole('button', { name: 'Forward request', exact: true })
      .click();
    await expect(
      page.getByText(
        'We could not forward this request. Reload the page or contact support@yawp.school.'
      )
    ).toBeVisible();
    expect(
      await db.freeTierAdminApproval.count({
        where: { applicationId: fixtureData.app.id },
      })
    ).toBe(1);
    expect(
      await db.freeTierApprovalDelivery.count({
        where: { approval: { applicationId: fixtureData.app.id } },
      })
    ).toBe(0);
    await capture(page, `${width}-teacher-self-forward-rejected`);
    await page.getByLabel('Administrator email').fill('rivera@example.org');
    await page
      .getByRole('button', { name: 'Forward request', exact: true })
      .click();
    await expect(
      page.getByText(
        'Request forwarded. We will notify your administrator and email you an update.'
      )
    ).toBeVisible();
    await expect(
      page.getByText('rivera@example.org', { exact: true })
    ).toBeVisible();
    await capture(page, `${width}-teacher-forwarded`);
    expect(
      await db.freeTierApprovalDelivery.count({
        where: {
          approval: { applicationId: fixtureData.app.id },
          state: 'QUEUED',
        },
      })
    ).toBe(2);
  });
test('flag-off and non-target controls', async ({ page }) => {
  await fixture(page);
  for (const mode of ['off', 'targeted'] as const) {
    await flag(mode);
    await page.goto('/app/free-tier/pending');
    await expect(
      page.getByRole('link', { name: 'Draft an email' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Resend reminder' })
    ).toBeVisible();
    await capture(page, `1280-${mode}`);
  }
});
for (const width of [1280, 390])
  test(`administrator form, forwarding and terminal states at ${width}`, async ({
    page,
  }) => {
    await flag('everyone');
    await page.setViewportSize({ width, height: 960 });
    const { app, approval } = await fixture(page);
    const { mintFreeTierLinkForE2E } =
      await import('../helpers/mint-free-tier-link');
    const signed = await mintFreeTierLinkForE2E(db, {
      applicationId: app.id,
      purpose: 'ADMIN_APPROVE',
    });
    const redirect = await mintFreeTierLinkForE2E(db, {
      applicationId: app.id,
      purpose: 'ADMIN_NOT_RIGHT_PERSON',
    });
    await db.freeTierAdminApproval.update({
      where: { id: approval.id },
      data: { signedLinkId: signed.linkId },
    });
    const url = `/free/admin/approve?t=${encodeURIComponent(signed.token)}`;
    await flag('off');
    await page.goto(url);
    await expect(
      page.locator('iframe[title="Book a time with Brian"]')
    ).toHaveCount(0);
    await capture(page, `${width}-admin-before`);
    await flag('everyone');
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'About YAWP' })
    ).toBeVisible();
    await expect(page.locator('[data-guide-slot=administrator]')).toHaveCount(
      1
    );
    if (width === 1280) {
      const info = await page.locator('.free-tier-approval-info').boundingBox();
      const form = await page.locator('.free-tier-form-card').boundingBox();
      expect(info!.x + info!.width).toBeLessThan(form!.x);
    }
    await page
      .getByText("I'd like to learn more first", { exact: true })
      .click();
    const calendar = page.locator('iframe[title="Book a time with Brian"]');
    await expect(calendar).toBeVisible();
    await expect(calendar).toHaveAttribute('loading', 'lazy');
    await expect(calendar).toHaveAttribute(
      'src',
      'https://app.usemotion.com/meet/brian-connell/ryxkqvr'
    );
    await expect(
      page.getByRole('link', { name: 'Open the calendar in a new tab' })
    ).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(
      page.getByText("Ms. Okafor's request will stay open.")
    ).toBeVisible();
    await capture(page, `${width}-admin`);
    await page
      .getByRole('button', { name: 'Approve YAWP', exact: true })
      .click();
    await expect(page.getByLabel('Your role')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await capture(page, `${width}-admin-validation`);
    await page.goto(
      `/free/admin/not-right-person?t=${encodeURIComponent(redirect.token)}`
    );
    await capture(page, `${width}-admin-forward`);
    await page
      .getByRole('button', { name: 'Forward request', exact: true })
      .click();
    await expect(page.getByLabel('Administrator name')).toHaveAttribute(
      'aria-invalid',
      'true'
    );
    await capture(page, `${width}-admin-forward-validation`);
    await page.getByLabel('Administrator name').fill('Ms. Rivera');
    await page.getByLabel('Administrator email').fill(app.email);
    await page
      .getByRole('button', { name: 'Forward request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Unable to forward' })
    ).toBeVisible();
    expect(
      await db.freeTierSignedLink.count({
        where: { applicationId: app.id, usedAt: null },
      })
    ).toBe(2);
    expect(
      await db.freeTierAdminApproval.count({ where: { applicationId: app.id } })
    ).toBe(1);
    await capture(page, `${width}-admin-self-forward-rejected`);
    await page.goto(
      `/free/admin/not-right-person?t=${encodeURIComponent(redirect.token)}`
    );
    await page.getByLabel('Administrator name').fill('Ms. Rivera');
    await page.getByLabel('Administrator email').fill('rivera@example.org');
    await page
      .getByRole('button', { name: 'Forward request', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Request forwarded' })
    ).toBeVisible();
    await capture(page, `${width}-admin-forwarded`);
    await page.goto(url);
    await expect(
      page.getByRole('heading', { name: 'This link was replaced' })
    ).toBeVisible();
    await capture(page, `${width}-admin-replaced`);
    for (const status of [
      'MANUAL_REVIEW',
      'REJECTED',
      'EXPIRED',
      'APPROVED',
    ] as const) {
      await db.freeTierApplication.update({
        where: { id: app.id },
        data: { status },
      });
      await page.goto('/app/free-tier/pending');
      await capture(page, `${width}-waiting-${status.toLowerCase()}`);
      await expect(
        page.getByRole('link', { name: 'Draft an email' })
      ).toHaveCount(0);
    }
    await page.goto('/free/admin/approve?t=invalid');
    await expect(
      page.getByRole('heading', { name: "We couldn't open this link" })
    ).toBeVisible();
    await capture(page, `${width}-admin-invalid`);
  });
test('paid member remains on legacy waiting page with rollout on', async ({
  page,
}) => {
  await flag('everyone');
  const { user } = await fixture(page);
  const org = await db.organization.create({
    data: { name: 'Local site account', plan: 'SCHOOL' },
  });
  try {
    await db.orgMembership.create({
      data: { userId: user.id, organizationId: org.id, role: 'TEACHER' },
    });
    await page.goto('/app/free-tier/pending');
    await expect(
      page.getByRole('link', { name: 'Draft an email' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Resend reminder' })
    ).toBeVisible();
    await capture(page, '1280-paid-member');
  } finally {
    await db.orgMembership.deleteMany({ where: { organizationId: org.id } });
    await db.organization.delete({ where: { id: org.id } });
  }
});
