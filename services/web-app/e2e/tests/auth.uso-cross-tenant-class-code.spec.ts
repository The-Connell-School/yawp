import { test, expect, type Page } from '@playwright/test';
import { createCookieSessionStorage } from 'react-router';
import { createE2EPrismaClient } from '../prisma-client';
import bcrypt from 'bcryptjs';

test.skip(
  process.env.SIGNON_LOCAL_TEST !== '1',
  'Disposable local database only'
);
test.describe.configure({ mode: 'serial' });

const db = createE2EPrismaClient();
const prefix = `uso-xt-${Date.now()}`;
const collisionCode = `${prefix}-shared`;
const homeOrgId = `${prefix}-home`;
const foreignOrgId = `${prefix}-foreign`;
const foreignSchoolName = `${prefix} Foreign High`;
const foreignClassTitle = `${prefix} Foreign English`;
const foreignTeacherName = `${prefix} Foreign Teacher`;
const flag = 'feature_flag.unified-sign-on';

async function authenticate(page: Page, userId: string) {
  const session = await db.session.create({
    data: {
      userId,
      expirationDate: new Date(Date.now() + 3600000),
    },
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
  const value = (await storage.commitSession(cookie))
    .split(';')[0]
    .slice('en_session='.length);
  await page.context().addCookies([
    {
      name: 'en_session',
      value: decodeURIComponent(value),
      url: test.info().project.use.baseURL!,
    },
  ]);
}

async function assertNoForeignMetadata(page: Page) {
  await expect(page.getByText(foreignSchoolName)).toHaveCount(0);
  await expect(page.getByText(foreignTeacherName)).toHaveCount(0);
  await expect(page.getByText(foreignClassTitle)).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Which class is yours?' })
  ).toHaveCount(0);
}

async function enableUnifiedSignOn() {
  await db.setting.upsert({
    where: { name: flag },
    update: { value: 'true' },
    create: { name: flag, value: 'true', valueType: 'boolean' },
  });
}

test.beforeAll(async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw new Error('Local DB required');
  await enableUnifiedSignOn();
  for (const orgId of [homeOrgId, foreignOrgId]) {
    await db.organization.create({
      data: { id: orgId, name: orgId, plan: 'SCHOOL' },
    });
    await db.school.create({
      data: {
        id: `${orgId}-school`,
        code: `${orgId}-school`,
        name: orgId === foreignOrgId ? foreignSchoolName : `${orgId} school`,
        organizationId: orgId,
      },
    });
  }
  await db.class.create({
    data: {
      id: `${prefix}-home-class`,
      code: collisionCode,
      title: `${prefix} Home English`,
      schoolId: `${homeOrgId}-school`,
    },
  });
  const foreignTeacher = await db.user.create({
    data: {
      id: `${prefix}-foreign-teacher`,
      name: foreignTeacherName,
      email: `${prefix}-foreign-teacher@yawp.local`,
    },
  });
  await db.class.create({
    data: {
      id: `${prefix}-foreign-class`,
      code: collisionCode,
      title: foreignClassTitle,
      schoolId: `${foreignOrgId}-school`,
      teachers: {
        create: {
          userId: foreignTeacher.id,
          organizationId: foreignOrgId,
          role: 'TEACHER',
          isOrgOwner: true,
        },
      },
    },
  });
  const hash = await bcrypt.hash('uso-cross-tenant-pass', 4);
  await db.user.create({
    data: {
      id: `${prefix}-active`,
      name: 'Active Student',
      email: `${prefix}-active@yawp.local`,
      password: { create: { hash } },
      memberships: {
        create: {
          id: `${prefix}-active-member`,
          organizationId: homeOrgId,
          role: 'STUDENT',
          isActive: true,
        },
      },
    },
  });
  await db.user.create({
    data: {
      id: `${prefix}-inactive`,
      name: 'Inactive Student',
      email: `${prefix}-inactive@yawp.local`,
      password: { create: { hash } },
      memberships: {
        create: {
          id: `${prefix}-inactive-member`,
          organizationId: homeOrgId,
          role: 'STUDENT',
          isActive: false,
        },
      },
    },
  });
});

test.afterAll(async () => {
  await db.signonFlow.deleteMany({
    where: { data: { path: ['userId'], string_starts_with: prefix } },
  });
  await db.session.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.orgMembership.deleteMany({
    where: { organizationId: { in: [homeOrgId, foreignOrgId] } },
  });
  await db.password.deleteMany({ where: { userId: { startsWith: prefix } } });
  await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.class.deleteMany({ where: { id: { startsWith: prefix } } });
  await db.school.deleteMany({
    where: { organizationId: { in: [homeOrgId, foreignOrgId] } },
  });
  await db.organization.deleteMany({
    where: { id: { in: [homeOrgId, foreignOrgId] } },
  });
  await db.$disconnect();
});

test('logged-out /auth/login denies cross-tenant class-code collisions', async ({
  page,
}) => {
  await page.goto('/auth/login');
  await page.getByLabel('Email or class code', { exact: true }).fill(collisionCode);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(
    page
      .getByText(/couldn't find that class/i)
      .or(page.getByText(/couldn't find a class/i))
  ).toBeVisible();
  await assertNoForeignMetadata(page);
});

test('signed-in /enter-code never surfaces foreign class metadata for collisions', async ({
  page,
}) => {
  await authenticate(page, `${prefix}-active`);
  await page.goto('/enter-code');
  await page.getByLabel('Class code', { exact: true }).fill(collisionCode);
  await page.getByRole('button', { name: 'Join class', exact: true }).click();
  await assertNoForeignMetadata(page);
});

test('/no-membership inactive student never surfaces foreign class metadata', async ({
  page,
}) => {
  await authenticate(page, `${prefix}-inactive`);
  await page.goto('/no-membership');
  await page
    .getByRole('button', { name: 'Enter a class code', exact: true })
    .click();
  await page.getByLabel('Class code', { exact: true }).fill(collisionCode);
  await page.getByRole('button', { name: 'Join class', exact: true }).click();
  await assertNoForeignMetadata(page);
});
