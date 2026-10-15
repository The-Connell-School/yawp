import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
test.skip(
  process.env.SIGNON_MOCK_GOOGLE !== '1',
  'Requires isolated mock provider preload'
);
test.describe.configure({ mode: 'serial' });
const db = createE2EPrismaClient();
const prefix = `google-browser-${Date.now()}`;
const evidence = process.env.SIGNON_EVIDENCE_DIR;
async function shot(page: any, name: string, width: number) {
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: path.join(evidence, `${name}-${width}-impl.png`),
      fullPage: true,
    });
  }
}
test.beforeAll(async () => {
  await db.setting.upsert({
    where: { name: 'feature_flag.unified-sign-on' },
    create: {
      name: 'feature_flag.unified-sign-on',
      value: 'true',
      valueType: 'boolean',
    },
    update: { value: 'true' },
  });
  for (const [id, name] of [
    [prefix, 'Lincoln High'],
    [prefix + '-b', 'City Writing Program'],
  ])
    await db.organization.create({ data: { id, name, plan: 'SCHOOL' } });
});
test.afterAll(async () => {
  await db.setting.deleteMany({
    where: { name: 'feature_flag.unified-sign-on' },
  });
  const users = await db.user.findMany({
    where: { email: { in: ['maya1280@yawp.local', 'maya390@yawp.local'] } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.signonIdentity.deleteMany({ where: { userId: { in: ids } } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.password.deleteMany({ where: { userId: { in: ids } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.organization.deleteMany({
    where: { id: { in: [prefix, prefix + '-b'] } },
  });
  await db.$disconnect();
});
for (const width of [1280, 390])
  test(`mocked Google provider: real cancellation, account proof, linking and membership handlers at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    const email = `maya${width}@yawp.local`;
    await db.user.create({
      data: {
        email,
        name: 'Maya Reynolds',
        password: { create: { hash: await bcrypt.hash('local-password', 10) } },
        memberships: {
          create: [
            { organizationId: prefix, role: 'TEACHER' },
            { organizationId: prefix + '-b', role: 'STUDENT' },
          ],
        },
      },
    });
    let cancel = true;
    await page.route(
      'https://accounts.google.com/o/oauth2/v2/auth?**',
      async (route) => {
        const url = new URL(route.request().url());
        const callback = new URL(url.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', url.searchParams.get('state')!);
        if (cancel) callback.searchParams.set('error', 'access_denied');
        else
          callback.searchParams.set(
            'code',
            Buffer.from(
              JSON.stringify({
                email,
                subject: `subject-${width}-${prefix}`,
                nonce: url.searchParams.get('nonce'),
                challenge: url.searchParams.get('code_challenge'),
              })
            ).toString('base64url')
          );
        await route.fulfill({
          status: 302,
          headers: { location: callback.toString() },
        });
      }
    );
    await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.getByRole('status')).toContainText('cancelled');
    await shot(page, 'signon-04-google-cancel', width);
    cancel = false;
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(
      page.getByRole('heading', { name: 'Enter your password' })
    ).toBeVisible();
    await shot(page, 'signon-05-google-account-proof', width);
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Use Google to sign in?' })
    ).toBeVisible();
    await shot(page, 'signon-29-link-google', width);
    await page
      .getByRole('button', { name: 'Link Google', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Where are you working today?' })
    ).toBeVisible();
    await shot(page, 'signon-27-membership', width);
    await page.getByRole('button', { name: 'Lincoln High Teacher' }).click();
    await expect(page).toHaveURL(/\/app\/my-classes$/);
    expect(
      await db.signonIdentity.count({
        where: { subject: `subject-${width}-${prefix}` },
      })
    ).toBe(1);
  });
