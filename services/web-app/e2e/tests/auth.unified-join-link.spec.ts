import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import fs from 'node:fs';
import path from 'node:path';

test.skip(
  process.env.SIGNON_LOCAL_TEST !== '1',
  'Disposable local database only'
);
const db = createE2EPrismaClient();
const id = `join-link-${Date.now()}`;
const flag = 'feature_flag.unified-sign-on';
const token = `${id}-private`;
const revoked = `${id}-revoked`;
const archived = `${id}-archived`;
const enabled = async (value: boolean) =>
  db.setting.upsert({
    where: { name: flag },
    update: { value: String(value) },
    create: { name: flag, value: String(value), valueType: 'boolean' },
  });
const counts = async () =>
  Promise.all([
    db.user.count(),
    db.session.count(),
    db.orgMembership.count(),
    db.class.findMany({
      select: { id: true, _count: { select: { students: true } } },
      orderBy: { id: 'asc' },
    }),
    db.signonFlow.count(),
  ]);

test.beforeAll(async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw Error('Local database only');
  await db.organization.create({
    data: { id, name: 'Join fixture', plan: 'FREE_CLASSROOM' },
  });
  await db.school.create({
    data: { id, code: id, name: 'Join fixture', organizationId: id },
  });
  await db.class.create({
    data: {
      id,
      code: id,
      title: 'English 11, Period 2',
      schoolId: id,
      studentJoinToken: token,
    },
  });
  await db.class.create({
    data: {
      id: `${id}-archived`,
      code: `${id}-archived`,
      schoolId: id,
      studentJoinToken: archived,
      isArchived: true,
    },
  });
  // Rotation revokes the prior token; this model has no time-based token expiry.
  await db.class.update({ where: { id }, data: { studentJoinToken: revoked } });
  await db.class.update({ where: { id }, data: { studentJoinToken: token } });
});
test.afterAll(async () => {
  await db.signonFlow.deleteMany({});
  await db.class.deleteMany({ where: { schoolId: id } });
  await db.school.delete({ where: { id } });
  await db.organization.delete({ where: { id } });
  await db.setting.deleteMany({ where: { name: flag } });
  await db.$disconnect();
});

for (const width of [1280, 390]) {
  test(`rejected join links use the error screen at ${width}`, async ({
    page,
  }) => {
    await enabled(true);
    await page.setViewportSize({ width, height: width === 1280 ? 1006 : 844 });
    const before = await counts();
    for (const [name, rejected] of [
      ['invalid', 'invalid'],
      ['revoked', revoked],
      ['archived', archived],
    ]) {
      const response = await page.goto(`/join?t=${rejected}`);
      expect(response?.status()).toBe(200);
      if (name === 'invalid' && process.env.SIGNON_EVIDENCE_DIR) {
        fs.mkdirSync(process.env.SIGNON_EVIDENCE_DIR, { recursive: true });
        await page.screenshot({
          path: path.join(
            process.env.SIGNON_EVIDENCE_DIR,
            `signon-18-invalid-link-${width}-${process.env.SIGNON_BEFORE === '1' ? 'before' : 'impl'}.png`
          ),
          fullPage: true,
        });
      }
      await expect(
        page.getByRole('heading', {
          name: "This class link doesn't work",
          exact: true,
        })
      ).toBeVisible();
      await expect(
        page.getByText('Ask your teacher for a new one.', { exact: true })
      ).toBeVisible();
      await expect(page.locator('input')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /Join class|Create account/i })
      ).toHaveCount(0);
      await expect(
        page.getByRole('link', { name: 'Sign in', exact: true })
      ).toHaveAttribute('href', '/auth/login');
      expect(
        (await page.context().cookies()).filter((c) =>
          /auth|membership|signon/.test(c.name)
        )
      ).toEqual([]);
    }
    expect(await counts()).toEqual(before);
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
    await expect(
      page.getByLabel('Email or class code', { exact: true })
    ).toBeVisible();
  });

  test(`bare, blank, valid and flag-off controls at ${width}`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1006 : 844 });
    const shot = async (name: string) => {
      if (!process.env.SIGNON_EVIDENCE_DIR) return;
      await page.screenshot({
        path: path.join(
          process.env.SIGNON_EVIDENCE_DIR,
          `${name}-${width}-impl.png`
        ),
        fullPage: true,
      });
    };
    for (const on of [true, false]) {
      await enabled(on);
      for (const query of ['', '?t=', '?t=%20%20']) {
        await page.goto(`/join${query}`);
        await expect(
          page.getByRole('heading', { name: 'Join your class', exact: true })
        ).toBeVisible();
        await expect(
          page.getByText(/Ask your teacher for the class join link/)
        ).toBeVisible();
        await expect(
          page.getByText(/Class codes alone are not enough to join on Yawp!/)
        ).toBeVisible();
        await expect(page.locator('input')).toHaveCount(0);
      }
      await shot(on ? 'bare-link' : 'flag-off-bare-link');
      if (!on) {
        await page.goto('/join?t=invalid');
        await expect(
          page.getByRole('heading', { name: 'Join your class', exact: true })
        ).toBeVisible();
        await shot('flag-off-invalid-link');
      }
      await page.goto(`/join?t=${token}`);
      if (on) {
        await expect(page).toHaveURL(/\/auth\/login\?continue=1/);
        await expect(
          page.getByText('English 11, Period 2', { exact: true })
        ).toBeVisible();
        await page.getByRole('button', { name: /^New/ }).click();
        await expect(
          page.getByLabel('First name', { exact: true })
        ).toBeVisible();
        await expect(page.getByText(/We add a number/)).toBeVisible();
        await shot('valid-link');
        await context.clearCookies();
      } else {
        await expect(
          page.getByRole('heading', {
            name: 'Create your student account',
            exact: true,
          })
        ).toBeVisible();
        await expect(page.getByLabel('Handle', { exact: true })).toBeVisible();
        await shot('flag-off-valid-link');
      }
    }
  });
}
