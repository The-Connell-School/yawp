import { test, expect, type Page, type Route } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';

test.skip(
  process.env.SIGNON_LOCAL_TEST !== '1',
  'Disposable local database and captured mail required'
);
test.describe.configure({ mode: 'serial' });
const prefix = `signon-browser-${Date.now()}`;
const db = createE2EPrismaClient();
const flag = 'feature_flag.unified-sign-on';
const evidence = process.env.SIGNON_EVIDENCE_DIR;
const email = `${prefix}@example.test`;
const capture = process.env.SIGNON_MAIL_CAPTURE_DIR!;
async function shot(page: Page, name: string, width: number) {
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: path.join(evidence, `${name}-${width}-impl.png`),
      fullPage: true,
    });
  }
}
async function codeFor(target: string) {
  const files = fs
    .readdirSync(capture)
    .map((file) => ({
      file,
      time: fs.statSync(path.join(capture, file)).mtimeMs,
    }))
    .sort((a, b) => b.time - a.time);
  for (const { file } of files) {
    const content = JSON.parse(
      fs.readFileSync(path.join(capture, file), 'utf8')
    );
    if (content.email === target) return content.code;
  }
  throw new Error('No captured code');
}
test.beforeAll(async () => {
  if (
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw new Error('Local database required');
  await db.organization.create({
    data: { id: prefix, name: 'Lincoln High', plan: 'SCHOOL' },
  });
  await db.school.create({
    data: {
      id: prefix,
      code: prefix,
      name: 'Lincoln High',
      organizationId: prefix,
    },
  });
  await db.class.create({
    data: {
      id: prefix,
      code: prefix,
      title: 'English 11, Period 2',
      schoolId: prefix,
    },
  });
});
test.afterAll(async () => {
  await db.setting.deleteMany({ where: { name: flag } });
  const users = await db.user.findMany({
    where: {
      OR: [
        { email: { in: ['maya1280@yawp.local', 'maya390@yawp.local'] } },
        { email: { contains: prefix } },
      ],
    },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.invitation.deleteMany({ where: { studentClassId: prefix } });
  await db.session.deleteMany({ where: { userId: { in: ids } } });
  await db.password.deleteMany({ where: { userId: { in: ids } } });
  await db.orgMembership.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
  await db.class.delete({ where: { id: prefix } });
  await db.school.delete({ where: { id: prefix } });
  await db.organization.delete({ where: { id: prefix } });
  await db.$disconnect();
});
for (const width of [1280, 390])
  test(`existing passwordless teacher activates through the location selector at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    const address = `${prefix}-teacher-${width}@example.test`;
    const second = `${prefix}-${width}`;
    const user = await db.user.create({
      data: {
        email: address,
        name: 'Existing Teacher',
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
      include: { memberships: true },
    });
    await db.school.create({
      data: {
        id: second,
        code: second,
        name: 'Selected location',
        organizationId: prefix,
      },
    });
    const invitation = await db.invitation.create({
      data: {
        type: 'onboard-teacher',
        target: address,
        secret: 'local-only',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
        metadata: JSON.stringify({ organizationId: prefix }),
      },
    });
    try {
      await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await page.getByLabel('Email or class code').fill(address);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Finish setting up your account' })
      ).toBeVisible();
      await shot(page, 'signon-23-teacher-activation', width);
      await page
        .getByRole('button', { name: 'Email me a code', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Check your email' })
      ).toBeVisible();
      await page
        .getByLabel('Code', { exact: true })
        .fill(await codeFor(address));
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/inv\/onboard-teacher$/);
      await page.getByLabel('Name', { exact: true }).fill('Activated Teacher');
      await page.getByRole('combobox').click();
      await page
        .getByRole('option', { name: 'Selected location', exact: true })
        .click();
      await page.getByLabel('Password', { exact: true }).fill('local-password');
      await page
        .getByLabel('Confirm Password', { exact: true })
        .fill('local-password');
      await shot(page, 'teacher-location-selector', width);
      await page
        .getByRole('button', { name: 'Create an account', exact: true })
        .click();
      await page.waitForLoadState('networkidle');
      if (page.url().endsWith('/auth/inv/onboard-teacher'))
        await shot(page, 'teacher-location-submitted', width);
      await expect(page).toHaveURL(/\/app\/my-classes$/);
      await shot(page, 'teacher-location-completed', width);
      const stored = await db.user.findUniqueOrThrow({
        where: { email: address },
        include: {
          password: true,
          memberships: { include: { schools: true } },
        },
      });
      expect(stored.id).toBe(user.id);
      expect(stored.emailVerifiedAt).not.toBeNull();
      expect(stored.password).not.toBeNull();
      expect(stored.memberships).toHaveLength(1);
      expect(stored.memberships[0].id).toBe(user.memberships[0].id);
      expect(stored.memberships[0].role).toBe('TEACHER');
      expect(stored.memberships[0].schools.map((s) => s.id)).toContain(second);
      expect(await db.invitation.count({ where: { id: invitation.id } })).toBe(
        0
      );
    } finally {
      await db.invitation.deleteMany({ where: { id: invitation.id } });
      await db.school.delete({ where: { id: second } });
    }
  });
for (const width of [1280, 390])
  test(`real handlers: invited student, email code errors/retry, verified signup and reset at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    const address = `maya${width}@yawp.local`;
    // Email identity is retained only for the existing invitation path. New
    // class-code registrations use generated handles in auth.unified-classcode.
    await db.invitation.create({
      data: {
        type: 'onboard-student',
        target: address,
        studentClassId: prefix,
        metadata: JSON.stringify({ klassId: prefix }),
        secret: 'local-only',
        algorithm: 'SHA-256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        expiresAt: new Date(Date.now() + 600000),
      },
    });
    await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await expect(
      page.getByRole('button', { name: 'Continue with Google' })
    ).toBeDisabled();
    await shot(page, 'signon-03-google-unavailable', width);
    await page.getByLabel('Email or class code').fill(address);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Finish setting up your account' })
    ).toBeVisible();
    await shot(page, 'signon-23-resolved-class', width);
    await page
      .getByRole('button', { name: 'Email me a code', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Check your email' })
    ).toBeVisible();
    await shot(page, 'signon-13-email-code', width);
    await page.getByLabel('Code', { exact: true }).fill('000000');
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('code');
    await shot(page, 'signon-14-code-error', width);
    await page.getByRole('button', { name: 'Resend code' }).click();
    await expect(page.getByRole('alert')).toContainText('Too many attempts');
    await shot(page, 'signon-14-code-retry', width);
    // Retry delay is server enforced; expire the cooldown only in this local fixture.
    const flowRow = await db.signonFlow.findFirstOrThrow({
      where: { data: { path: ['identifier'], equals: address } },
      orderBy: { expiresAt: 'desc' },
    });
    const flow = flowRow.data as any;
    flow.otp.sent = 0;
    flow.otp.expires = 0;
    await db.signonFlow.update({
      where: { id: flowRow.id },
      data: { data: flow },
    });
    await page.reload(); // A fresh loader resumes only with the explicit continuation.
    await page.goto('/auth/login?continue=1');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That code has expired. Send yourself a new one.'
    );
    await shot(page, 'signon-14-code-expired', width);
    await page
      .getByRole('button', { name: 'Send a new code', exact: true })
      .click();
    await expect(page.getByRole('status')).toHaveText(
      'New code sent. Check spam too.'
    );
    await shot(page, 'signon-14-code-resent', width);
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Create your account' })
    ).toBeVisible();
    await shot(page, 'signon-15-verified-signup', width);
    await page.getByLabel('Your name').fill('Maya Reynolds');
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('local-password');
    await page
      .getByRole('button', { name: 'Create Account', exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/my-classes$/);
    const user = await db.user.findUniqueOrThrow({
      where: { email: address },
      include: { memberships: true },
    });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.memberships[0].role).toBe('STUDENT');
    await page.context().clearCookies();
    await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Email or class code').fill(address);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Enter your password' })
    ).toBeVisible();
    await shot(page, 'signon-05-resolved-password', width);
    // Exercise the full-document reset continuation with slow client startup.
    // Server-rendered headings alone do not prove React handlers are attached.
    const delayResetScripts = async (route: Route) => {
      if (route.request().resourceType() === 'script')
        await new Promise((resolve) => setTimeout(resolve, 1000));
      await route.continue();
    };
    await page.route('**/*', delayResetScripts);
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reset your password', exact: true })
    ).toBeVisible();
    // Forgot password performs a full document navigation. Wait for the new
    // client's handlers, as at the other entry/continuation boundaries above.
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.unroute('**/*', delayResetScripts);
    await shot(page, 'signon-13-reset-code', width);
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Set a new password' })
    ).toBeVisible();
    await shot(page, 'signon-16-reset-password', width);
    await page
      .getByLabel('New password', { exact: true })
      .fill('new-local-password');
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill('new-local-password');
    await page
      .getByRole('button', { name: 'Save password', exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/my-classes$/);
  });
test('flag off retains live legacy login, signup, class links, and direct callback gates', async ({
  page,
  request,
}) => {
  for (const value of [
    null,
    'broken',
    'false',
    '{"mode":"targeted","orgIds":["demo"]}',
  ]) {
    await db.setting.deleteMany({ where: { name: flag } });
    if (value)
      await db.setting.create({
        data: { name: flag, value, valueType: 'json' },
      });
    await page.goto('/auth/login');
    await expect(
      page.getByRole('heading', { name: 'Welcome back!' })
    ).toBeVisible();
    const result = await request.get(
      '/auth/unified/google/callback?code=forged&state=forged'
    );
    expect(result.status()).toBe(404);
  }
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/join?t=invalid', 'class-link'],
    ]) {
      await page.goto(route);
      await shot(page, `flag-off-${name}`, width);
    }
  }
});

test('bare short and reserved handle words resolve as real class codes in the browser', async ({
  page,
}) => {
  await db.setting.upsert({
    where: { name: flag },
    update: { value: 'true' },
    create: { name: flag, value: 'true', valueType: 'boolean' },
  });
  for (const classCode of ['12', 'student']) {
    await db.class.update({ where: { id: prefix }, data: { code: classCode } });
    await page.goto('/auth/login');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Email or class code').fill(classCode);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Join your class' })
    ).toBeVisible();
    await expect(
      page.getByText('English 11, Period 2', { exact: true })
    ).toBeVisible();
  }
});

test('local rollout rollback restores legacy views and blocks an in-flight reset', async ({
  page,
  request,
}) => {
  for (const width of [1280, 390]) {
    const address = `rollback-${width}-${prefix}@example.test`;
    await db.user.create({
      data: {
        email: address,
        password: {
          create: {
            hash: await bcrypt.hash('local-password', 10),
          },
        },
      },
    });
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.deleteMany({ where: { name: flag } });
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/auth/inv/forgot-password', 'reset'],
    ]) {
      await page.goto(route);
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await expect(page.locator('[data-signon-screen]')).toHaveCount(0);
      await page.mouse.move(0, 0);
      await shot(page, `flag-off-before-${name}`, width);
    }
    await db.setting.create({
      data: {
        name: flag,
        value: '{"mode":"everyone","orgIds":[]}',
        valueType: 'json',
      },
    });
    await page.goto('/auth/login');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Email or class code').fill(address);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Enter your password' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Forgot password?' }).click();
    await expect(
      page.getByRole('heading', { name: 'Reset your password', exact: true })
    ).toBeVisible();
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await shot(page, 'signon-13-before-rollback-reset', width);
    const sessionsBefore = await db.session.count();
    await db.setting.update({
      where: { name: flag },
      data: { value: '{"mode":"off","orgIds":[]}' },
    });
    await page.getByLabel('Code', { exact: true }).fill(await codeFor(address));
    const rejected = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname.startsWith('/auth/login')
    );
    await page.getByRole('button', { name: 'Verify', exact: true }).click();
    // The already-open client can retain its old screen. The OFF server dispatch
    // rejects this unified payload through legacy form validation. A fresh GET
    // below must render legacy UI; no session is issued by the rejected POST.
    expect((await rejected).status()).toBe(422);
    expect(await db.session.count()).toBe(sessionsBefore);
    expect(
      (
        await request.get(
          '/auth/unified/google/callback?code=forged&state=forged'
        )
      ).status()
    ).toBe(404);
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/auth/inv/forgot-password', 'reset'],
    ]) {
      await page.goto(route);
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await expect(page.locator('[data-signon-screen]')).toHaveCount(0);
      await page.mouse.move(0, 0);
      await shot(page, `flag-off-after-${name}`, width);
    }
  }
  // This database began without the flag. Restore that exact local state.
  await db.setting.deleteMany({ where: { name: flag } });
});
