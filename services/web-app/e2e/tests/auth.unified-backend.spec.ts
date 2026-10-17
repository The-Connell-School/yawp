import { test, expect, type Page, type Route } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

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
test.beforeEach(async ({ context }) => {
  // Separate journeys model separate clients. Keep one address throughout each
  // case so proof failures, resend cooldowns and retries use the real limiters.
  const groups = randomBytes(12).toString('hex').match(/.{4}/g)!;
  await context.setExtraHTTPHeaders({
    'x-forwarded-for': `2001:db8:${groups.join(':')}`,
  });
});
async function shot(page: Page, name: string, width: number) {
  if (evidence) {
    fs.mkdirSync(evidence, { recursive: true });
    await page.screenshot({
      path: path.join(evidence, `${name}-${width}-impl.png`),
      fullPage: true,
      mask: [
        page.locator(
          'input[type="password"], input[name="username"], input[name="identifier"], input[name="code"], input[name="classCode"], .signon-identity, .signon-chips, .signon-copy strong, #signon-username-help[role="alert"]'
        ),
      ],
    });
  }
}
// FAILURES.md: di-signon-fix-handle-validation-copy. Real handlers and DB.
async function passwordErrors(
  page: Page,
  width: number,
  kind: string,
  reset = false
) {
  test.fail(
    process.env.SIGNON_VALIDATION_PHASE === 'before',
    'Reproduces legacy validation copy on current main'
  );
  const password = page.getByLabel(reset ? 'New password' : 'Password', {
    exact: true,
  });
  const confirm = page.getByLabel(
    reset ? 'Confirm new password' : 'Confirm password',
    { exact: true }
  );
  const submit = page.getByRole('button', {
    name: reset
      ? 'Save password'
      : kind === 'generated-handle'
        ? 'Join class'
        : 'Create Account',
    exact: true,
  });
  const snapshot = () =>
    Promise.all([
      db.user.count(),
      db.session.count(),
      db.orgMembership.count(),
      db.classStudentHandle.count(),
      db.orgMembership.findMany({
        orderBy: { id: 'asc' },
        include: {
          classesAsStudent: { select: { id: true }, orderBy: { id: 'asc' } },
        },
      }),
      db.password.findMany({ orderBy: { userId: 'asc' } }),
    ]);
  const before = await snapshot();
  const check = async (source: string) => {
    await shot(
      page,
      `validation-${kind}-${source}-${process.env.SIGNON_VALIDATION_PHASE || 'after'}`,
      width
    );
    if (evidence)
      fs.appendFileSync(
        path.join(evidence, 'validation-copy.jsonl'),
        JSON.stringify({
          width,
          kind,
          source,
          phase: process.env.SIGNON_VALIDATION_PHASE || 'after',
          password: await page.locator('#signon-password-help').textContent(),
          confirmation: await page
            .locator('#signon-confirmPassword-help')
            .textContent(),
        }) + '\n'
      );
    expect.soft(await password.getAttribute('aria-invalid')).toBe('true');
    await expect
      .soft(page.locator('#signon-password-help'))
      .toHaveText('Use at least 6 characters.');
    await expect
      .soft(page.locator('#signon-confirmPassword-help'))
      .toHaveText("These passwords don't match.");
    expect(await snapshot()).toEqual(before);
  };
  await password.fill('short');
  await confirm.fill('different');
  await submit.click();
  await check('client');
  // Submit valid browser values, changing only the outgoing payload so the
  // actual server validator rejects it. No response or proof is fabricated.
  await password.fill('123456');
  await confirm.fill('123456');
  const invalidateOnce = async (route: Route) => {
    const body = new URLSearchParams(route.request().postData() || '');
    if (
      !['register-student', 'create-account'].includes(body.get('intent') || '')
    )
      return route.continue();
    body.set('password', 'short');
    body.set('confirmPassword', 'different');
    await route.continue({ postData: body.toString() });
  };
  await page.route('**/auth/login*', invalidateOnce);
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('/auth/login')
  );
  await submit.click();
  expect((await response).status()).toBe(400);
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  await page.unroute('**/auth/login*', invalidateOnce);
  await check('server');
  await password.fill('x'.repeat(101));
  await confirm.fill('x'.repeat(101));
  await submit.click();
  await expect(page.locator('#signon-password-help')).toHaveText(
    'Password is too long'
  );
  await expect(page.locator('#signon-confirmPassword-help')).toHaveText(
    'Password is too long'
  );
  expect(await snapshot()).toEqual(before);
  // The actual six-character boundary remains valid in every journey.
  await password.fill('123456');
  await confirm.fill('123456');
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
  // No-mail flows run before the mailer has created its capture directory.
  fs.mkdirSync(capture, { recursive: true, mode: 0o700 });
  await db.organization.create({
    data: { id: prefix, name: 'Lincoln High', plan: 'SCHOOL' },
  });
  await db.school.create({
    data: {
      id: prefix,
      code: prefix,
      name: 'Lincoln High School',
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
  await db.user.create({
    data: {
      email: `${prefix}-teacher@example.test`,
      name: 'Ms. Okafor',
      memberships: {
        create: {
          organizationId: prefix,
          role: 'TEACHER',
          classesAsTeacher: { connect: { id: prefix } },
        },
      },
    },
  });
});
test.afterAll(async () => {
  await db.setting.deleteMany({ where: { name: flag } });
  const users = await db.user.findMany({
    where: {
      OR: [
        { email: { contains: prefix } },
        { memberships: { some: { organizationId: prefix } } },
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
// FAILURES.md: di-signon-fix-join-confirmation. No mocked auth responses.
for (const width of [1280, 390]) {
  for (const journey of [
    'password-new',
    'password-already',
    'handle',
    'email-signup',
  ]) {
    test(`class confirmation ${journey} at ${width}`, async ({ page }) => {
      test.setTimeout(60000);
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      await db.setting.upsert({
        where: { name: flag },
        update: { value: 'true' },
        create: { name: flag, value: 'true', valueType: 'boolean' },
      });
      const address = `${prefix}-${journey}-${width}@example.test`;
      const username = `joined${width}${journey.replace(/-/g, '')}${Date.now()}`;
      const password = 'local-password';
      const already = journey === 'password-already' || journey === 'handle';
      let userId: string;
      if (journey !== 'email-signup') {
        const user = await db.user.create({
          data: {
            email: address,
            username,
            name: 'Local Student',
            password: { create: { hash: await bcrypt.hash(password, 10) } },
            memberships: {
              create: {
                organizationId: prefix,
                role: 'STUDENT',
                ...(already
                  ? { classesAsStudent: { connect: { id: prefix } } }
                  : {}),
              },
            },
          },
        });
        userId = user.id;
      }
      const next = () =>
        page.getByRole('button', { name: 'Continue', exact: true });
      await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await page.getByLabel('Email or class code').fill(prefix);
      await next().click();
      await page
        .getByRole('button', {
          name: journey === 'handle' ? /^Returning/ : /^New/,
        })
        .click();
      if (journey === 'handle') {
        await page.getByLabel('Handle', { exact: true }).fill(username);
        await page.getByLabel('Password', { exact: true }).fill(password);
        await page.getByRole('button', { name: 'Log In', exact: true }).click();
      } else {
        await page
          .getByRole('button', { name: 'Use school email', exact: true })
          .click();
        await page.getByLabel('School email', { exact: true }).fill(address);
        await next().click();
        if (journey === 'email-signup') {
          await page
            .getByRole('button', { name: 'Email me a code', exact: true })
            .click();
          await expect(page.getByLabel('Code', { exact: true })).toBeVisible();
          await page
            .getByLabel('Code', { exact: true })
            .fill(await codeFor(address));
          await page
            .getByRole('button', { name: 'Verify', exact: true })
            .click();
          await page
            .getByLabel('Your name', { exact: true })
            .fill('Local Student');
          await page.getByLabel('Password', { exact: true }).fill(password);
          await page
            .getByLabel('Confirm password', { exact: true })
            .fill(password);
          await page
            .getByRole('button', { name: 'Create Account', exact: true })
            .click();
        } else {
          await shot(page, `signon-40-${journey}-notice`, width);
          await page
            .getByRole('button', { name: 'Sign in instead', exact: true })
            .click();
          await page.getByLabel('Password', { exact: true }).fill(password);
          await page
            .getByRole('button', { name: 'Log In', exact: true })
            .click();
        }
      }
      await page.waitForLoadState('networkidle');
      await shot(page, `signon-${already ? '44' : '43'}-${journey}`, width);
      test.fail(
        process.env.SIGNON_EXPECT_FAILURE === '1',
        'Current main skips the class confirmation'
      );
      await expect(
        page.getByRole('heading', {
          name: already ? "You're already in this class" : "You're in!",
          exact: true,
        })
      ).toBeVisible({ timeout: 8000 });
      await expect(page.locator('.signon-class')).toContainText(
        'English 11, Period 2'
      );
      await expect(page.locator('.signon-class')).toContainText('Lincoln High');
      await expect(page.locator('.signon-class')).toContainText('Ms. Okafor');
      await expect(
        page.getByText('Your handle is', { exact: false })
      ).toHaveCount(0);
      const user = await db.user.findUniqueOrThrow({
        where: { email: address },
      });
      userId = user.id;
      const sessionCount = await db.session.count({ where: { userId } });
      expect(sessionCount).toBe(1);
      const flowCookies = (await page.context().cookies()).filter(
        (c) => c.name === 'yawp_signon'
      );
      expect(flowCookies).toHaveLength(1);
      await page.reload();
      await expect(
        page.getByRole('button', { name: 'Go to my class', exact: true })
      ).toBeVisible();
      expect(await db.session.count({ where: { userId } })).toBe(sessionCount);
      await page
        .getByRole('button', { name: 'Go to my class', exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/my-classes$/);
      await shot(
        page,
        `signon-${already ? '44' : '43'}-${journey}-destination`,
        width
      );
      expect(await db.session.count({ where: { userId } })).toBe(sessionCount);
      expect(
        await db.orgMembership.count({
          where: { userId, classesAsStudent: { some: { id: prefix } } },
        })
      ).toBe(1);
      expect(await db.user.count({ where: { email: address } })).toBe(1);
      await page.goBack();
      await page.waitForLoadState('networkidle');
      expect(await db.session.count({ where: { userId } })).toBe(sessionCount);
      expect(
        await db.orgMembership.count({
          where: { userId, classesAsStudent: { some: { id: prefix } } },
        })
      ).toBe(1);
    });
  }
}
for (const width of [1280, 390])
  test(`confirmation flag-OFF legacy controls at ${width}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.deleteMany({ where: { name: flag } });
    for (const [route, name] of [
      ['/auth/login?screen=joined&variant=already', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/join?t=invalid-local-token', 'class-link'],
      ['/free', 'free-trial'],
    ]) {
      await page.goto(route);
      await expect(page.locator('[data-signon-screen]')).toHaveCount(0);
      await shot(page, `flag-off-${name}`, width);
    }
    const address = `${prefix}-legacy-${width}@example.test`;
    const user = await db.user.create({
      data: {
        email: address,
        password: { create: { hash: await bcrypt.hash('local-password', 10) } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    await page.goto('/auth/login?redirectTo=https%3A%2F%2Fevil.example');
    await page.getByLabel('Email or handle').fill(address);
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(page).toHaveURL(/\/app\/?$/);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await db.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
  });
// Real resolver/registration regression for FAILURES.md di-signon-fix-email-handle-notice.
for (const width of [1280, 390])
  test(`email-origin free-class notice survives navigation and validation at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const id = `${prefix}-free-${width}`;
    const address = `${id}@example.test`;
    const username = `notice${width}${Date.now()}`;
    const notice =
      "We won't save your email. This class uses a handle and password.";
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    await db.organization.create({
      data: { id, name: 'Lincoln High', plan: 'FREE_CLASSROOM' },
    });
    await db.school.create({
      data: { id, code: id, name: 'Lincoln High', organizationId: id },
    });
    await db.class.create({
      data: {
        id,
        code: 'qa-handle',
        title: 'English 11, Period 2',
        schoolId: id,
        studentJoinToken: id,
      },
    });
    const identityCount = await db.signonIdentity.count();
    const mailBefore = fs.readdirSync(capture).length;
    const expectForm = async (origin: boolean) => {
      await expect(
        page.getByRole('heading', { name: 'Create your account', exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('English 11, Period 2', { exact: true })
      ).toBeVisible();
      await expect(
        page.getByLabel('First name', { exact: true })
      ).toBeVisible();
      await expect(page.getByLabel('Last name', { exact: true })).toBeVisible();
      await expect(page.getByText(notice, { exact: true })).toHaveCount(
        origin ? 1 : 0
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    };
    try {
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await page.getByLabel('Email or class code').fill(address);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page
        .getByRole('button', { name: "I'm a student I have a class code" })
        .click();
      await page.getByLabel('Class code', { exact: true }).fill('qa-handle');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: /^New/ }).click();
      await expect(
        page.getByRole('heading', { name: 'Create your account', exact: true })
      ).toBeVisible();
      await shot(page, 'signon-38-email-origin', width);
      await expectForm(true);
      const banner = page.getByText(notice, { exact: true });
      const card = page.locator('.signon-class');
      expect((await banner.boundingBox())!.y).toBeGreaterThan(
        (await card.boundingBox())!.y
      );
      expect((await banner.boundingBox())!.y).toBeLessThan(
        (await page.getByLabel('First name', { exact: true }).boundingBox())!.y
      );
      await page
        .getByRole('button', { name: 'Join class', exact: true })
        .click();
      await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
      await expectForm(true);
      await page.getByRole('button', { name: 'Back', exact: true }).click();
      await page
        .getByRole('button', {
          name: 'Wrong class? Re-enter the code',
          exact: true,
        })
        .click();
      await page
        .getByLabel('Class code', { exact: true })
        .fill('missing-local-class');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(
        page
          .getByText(
            "We couldn't find a class with that code. Check it with your teacher.",
            { exact: true }
          )
          .first()
      ).toBeVisible();
      await page.getByLabel('Class code', { exact: true }).fill('qa-handle');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: /^New/ }).click();
      await expectForm(true);
      await page.getByLabel('First name', { exact: true }).fill('Local');
      await page.getByLabel('Last name', { exact: true }).fill('Notice');
      await page.getByLabel('Password', { exact: true }).fill('123456');
      await page.getByLabel('Confirm password', { exact: true }).fill('123456');
      await passwordErrors(page, width, 'generated-handle');
      // Reach real server validation despite the client's valid values.
      const invalidateOnce = async (route: Route) => {
        const body = new URLSearchParams(route.request().postData() || '');
        if (body.get('intent') !== 'register-student') return route.continue();
        body.set('firstName', '123');
        await route.continue({ postData: body.toString() });
        await page.unroute('**/auth/login*', invalidateOnce);
      };
      await page.route('**/auth/login*', invalidateOnce);
      await page
        .getByRole('button', { name: 'Join class', exact: true })
        .click();
      await expect(
        page.getByLabel('First name', { exact: true })
      ).toHaveAttribute('aria-invalid', 'true');
      await expectForm(true);
      await shot(page, 'signon-38-email-origin-server-validation', width);
      // Main assigns a suffix for an occupied class handle instead of asking
      // the student to edit a taken handle. Exercise that real collision path.
      const taken = await db.user.create({
        data: {
          username,
          name: 'Taken Local Handle',
          memberships: {
            create: {
              role: 'STUDENT',
              organizationId: id,
              classesAsStudent: { connect: { id } },
            },
          },
          classStudentHandles: {
            create: {
              classId: id,
              handle: 'LocalNotice',
              handleKey: 'localnotice',
            },
          },
        },
      });
      await page.getByLabel('First name', { exact: true }).fill('Local');
      await page.getByLabel('Last name', { exact: true }).fill('Notice');
      await page.getByLabel('Password', { exact: true }).fill('123456');
      await page.getByLabel('Confirm password', { exact: true }).fill('123456');
      await page
        .getByRole('button', { name: 'Join class', exact: true })
        .click();
      await expect(
        page.getByRole('heading', { name: "You're in!" })
      ).toBeVisible();
      await expect(
        page.getByText('@LocalNotice1', { exact: true })
      ).toBeVisible();
      const alias = await db.classStudentHandle.findUniqueOrThrow({
        where: {
          classId_handleKey: { classId: id, handleKey: 'localnotice1' },
        },
      });
      expect(alias.userId).not.toBe(taken.id);
      expect(await db.session.count({ where: { userId: alias.userId } })).toBe(
        0
      );
      await shot(page, 'signon-43-generated-handle', width);
      await page.reload();
      await expect(
        page.getByText('@LocalNotice1', { exact: true })
      ).toBeVisible();
      expect(await db.session.count({ where: { userId: alias.userId } })).toBe(
        0
      );
      await page
        .getByRole('button', { name: 'Go to my class', exact: true })
        .click();
      await expect(page).toHaveURL(/\/app\/my-classes$/);
      const stored = await db.user.findUniqueOrThrow({
        where: { id: alias.userId },
        include: {
          password: true,
          memberships: { include: { classesAsStudent: true } },
          sessions: true,
        },
      });
      expect(stored.email).toBeNull();
      expect(stored.emailVerifiedAt).toBeNull();
      expect(stored.password).not.toBeNull();
      expect(await bcrypt.compare('123456', stored.password!.hash)).toBe(true);
      expect(stored.sessions).toHaveLength(1);
      expect(stored.memberships).toHaveLength(1);
      expect(stored.memberships[0].role).toBe('STUDENT');
      expect(stored.memberships[0].classesAsStudent.map((k) => k.id)).toContain(
        id
      );
      expect(await db.user.count({ where: { email: address } })).toBe(0);
      expect(await db.signonIdentity.count()).toBe(identityCount);
      expect(fs.readdirSync(capture)).toHaveLength(mailBefore);
      await page.context().clearCookies();
      await page.goto('/auth/login');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await page.getByLabel('Email or class code').fill('qa-handle');
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: /^New/ }).click();
      await expectForm(false);
      await shot(page, 'signon-38-direct-code', width);
    } finally {
      const users = await db.user.findMany({
        where: { memberships: { some: { organizationId: id } } },
        select: { id: true },
      });
      const ids = users.map((u) => u.id);
      await db.session.deleteMany({ where: { userId: { in: ids } } });
      await db.password.deleteMany({ where: { userId: { in: ids } } });
      await db.orgMembership.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.class.delete({ where: { id } });
      await db.school.delete({ where: { id } });
      await db.organization.delete({ where: { id } });
    }
  });

// FAILURES.md: di-signon-fix-existing-class-email-notice. Real handlers only.
for (const width of [1280, 390])
  test(`school class existing-email notice retains context and requires password proof at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    const address = `${prefix}-existing-${width}@example.test`;
    const password = 'disposable-password';
    const user = await db.user.create({
      data: {
        email: address,
        name: 'Local Student',
        emailVerifiedAt: new Date(),
        password: { create: { hash: await bcrypt.hash(password, 10) } },
        memberships: { create: { organizationId: prefix, role: 'STUDENT' } },
      },
    });
    const mailBefore = fs.readdirSync(capture).length;
    const notice =
      'You already have an account with this email. Sign in to join this class.';
    const continueButton = () =>
      page.getByRole('button', { name: 'Continue', exact: true });
    await page.goto('/auth/login?redirectTo=%2Fapp%2Fmy-classes');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Email or class code').fill(prefix);
    await continueButton().click();
    await page.getByRole('button', { name: /^New/ }).click();
    // Main's generated-handle registration remains available; email classes
    // additionally expose their v2 school-email option.
    await shot(page, 'signon-40-new-before-email-option', width);
    await page
      .getByRole('button', { name: 'Use school email', exact: true })
      .click({ timeout: 8000 });
    await page.getByLabel('School email', { exact: true }).fill(address);
    await continueButton().click();
    await shot(page, 'signon-40-existing-before-assertion', width);
    const expectNotice = async () => {
      await expect(
        page.getByRole('heading', { name: 'Create your account', exact: true })
      ).toBeVisible();
      await expect(
        page.getByText('English 11, Period 2', { exact: true })
      ).toBeVisible();
      await expect(page.getByText(notice, { exact: true })).toBeVisible();
      const banner = page.getByRole('status').filter({ hasText: notice });
      await expect(banner).toHaveCSS('padding', '10px 12px');
      await expect(banner).toHaveCSS('gap', '10px');
      await expect(banner).toHaveCSS('font-size', '14px');
      await expect(banner).toHaveCSS('line-height', '21px');
      await expect(banner).toHaveCSS('background-color', 'rgb(230, 226, 214)');
      await expect(banner).toHaveCSS('color', 'rgb(60, 56, 40)');
      await expect(banner).toHaveCSS('border-radius', '6px');
      await expect(banner.locator('svg')).toHaveAttribute('width', '16');
      const classBox = (await page.locator('.signon-class').boundingBox())!;
      const bannerBox = (await banner.boundingBox())!;
      const googleBox = (await page
        .getByRole('button', { name: 'Continue with Google' })
        .boundingBox())!;
      expect(bannerBox.y).toBeGreaterThan(classBox.y + classBox.height);
      expect(googleBox.y).toBeGreaterThan(bannerBox.y + bannerBox.height);

      await expect(
        page.getByLabel('School email', { exact: true })
      ).toHaveValue(address);
      await expect(
        page.getByRole('button', { name: 'Sign in instead', exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Continue with Google', exact: true })
      ).toBeDisabled();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    };
    await expectNotice();
    await shot(page, 'signon-40-existing', width);
    // A changed address follows ordinary unknown-email signup; returning to
    // the existing notice must re-resolve its displayed email on the server.
    await page
      .getByLabel('School email', { exact: true })
      .fill(`${prefix}-unknown-${width}@example.test`);
    await page
      .getByRole('button', { name: 'Sign in instead', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Finish setting up your account',
        exact: true,
      })
    ).toBeVisible();
    await shot(page, 'signon-23-school-unknown', width);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectNotice();
    await page.route('**/auth/login*', async (route) => {
      const body = new URLSearchParams(route.request().postData() || '');
      if (body.get('intent') === 'class-email-signin') {
        body.set('identifier', 'bad@');
        await route.continue({ postData: body.toString() });
      } else await route.continue();
    });
    await page
      .getByRole('button', { name: 'Sign in instead', exact: true })
      .click();
    await expect(
      page.getByText('That email looks incomplete. Check it and try again.', {
        exact: true,
      })
    ).toBeVisible();
    await expectNotice();
    await shot(page, 'signon-40-server-validation', width);
    await page.unroute('**/auth/login*');
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await db.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
    await page
      .getByRole('button', { name: 'Sign in instead', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Enter your password', exact: true })
    ).toBeVisible();
    await shot(page, 'signon-05-class-password', width);
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expectNotice();
    // Changing the email and client/server validation do not lose the class.
    await page.getByLabel('School email', { exact: true }).fill('bad@');
    await page
      .getByRole('button', { name: 'Sign in instead', exact: true })
      .click();
    await expect(
      page.getByText('That email looks incomplete. Check it and try again.', {
        exact: true,
      })
    ).toBeVisible();
    await shot(page, 'signon-40-validation', width);
    await page.getByLabel('School email', { exact: true }).fill(address);
    await page
      .getByRole('button', { name: 'Sign in instead', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Enter your password', exact: true })
    ).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(
      page.getByText("That password isn't right. Try again, or reset it.", {
        exact: true,
      })
    ).toBeVisible();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
    expect(
      await db.orgMembership.count({
        where: { userId: user.id, classesAsStudent: { some: { id: prefix } } },
      })
    ).toBe(0);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log In', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: "You're in!", exact: true })
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Go to my class', exact: true })
      .click();
    await page.waitForURL('**/app/my-classes');
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(
      await db.orgMembership.count({
        where: {
          userId: user.id,
          role: 'STUDENT',
          classesAsStudent: { some: { id: prefix } },
        },
      })
    ).toBe(1);
    expect(fs.readdirSync(capture)).toHaveLength(mailBefore);
  });

for (const width of [1280, 390])
  test(`school email Back restores primary New registration at ${width}`, async ({
    page,
  }) => {
    test.setTimeout(45000);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await db.setting.upsert({
      where: { name: flag },
      update: { value: 'true' },
      create: { name: flag, value: 'true', valueType: 'boolean' },
    });
    const backEmail = `${prefix}-back-existing-${width}@example.test`;
    await db.user.create({
      data: { email: backEmail, name: 'Local Existing' },
    });
    const mailBefore = fs.readdirSync(capture).length;
    await page.goto('/auth/login');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Email or class code').fill(prefix);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('button', { name: /^New/ }).click();
    await page
      .getByRole('button', { name: 'Use school email', exact: true })
      .click();
    await expect(
      page.getByLabel('School email', { exact: true })
    ).toBeVisible();
    await page.getByLabel('School email', { exact: true }).fill(backEmail);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'Sign in instead', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await expect(page.getByLabel('First name', { exact: true })).toBeVisible();
    await page.getByLabel('First name', { exact: true }).fill('EmailBack');
    await page.getByLabel('Last name', { exact: true }).fill('Local');
    await page.getByLabel('Password', { exact: true }).fill('local-password');
    await page
      .getByLabel('Confirm password', { exact: true })
      .fill('local-password');
    await page.getByRole('button', { name: 'Join class', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: "You're in!", exact: true })
    ).toBeVisible();
    const users = await db.user.findMany({
      where: {
        name: 'EmailBack Local',
        memberships: {
          some: {
            organizationId: prefix,
            classesAsStudent: { some: { id: prefix } },
          },
        },
      },
    });
    expect(users.length).toBeGreaterThan(0);
    for (const user of users) {
      expect(user.email).toBeNull();
      expect(user.emailVerifiedAt).toBeNull();
    }
    expect(fs.readdirSync(capture)).toHaveLength(mailBefore);
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
    const address = `${prefix}-maya${width}@example.test`;
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
    await passwordErrors(page, width, 'email-signup');
    await page.getByLabel('Password', { exact: true }).fill('123456');
    await page.getByLabel('Confirm password', { exact: true }).fill('123456');
    await page
      .getByRole('button', { name: 'Create Account', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: "You're in!", exact: true })
    ).toBeVisible();
    await shot(page, 'signon-43-invited-email', width);
    await page
      .getByRole('button', { name: 'Go to my class', exact: true })
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
    await passwordErrors(page, width, 'reset', true);
    await page.getByLabel('New password', { exact: true }).fill('654321');
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill('654321');
    await page
      .getByRole('button', { name: 'Save password', exact: true })
      .click();
    await expect(page).toHaveURL(/\/app\/my-classes$/);
    const changed = await db.password.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(await bcrypt.compare('654321', changed.hash)).toBe(true);
    expect(await bcrypt.compare('123456', changed.hash)).toBe(false);
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
    await page.goto('/auth/login');
    await page.waitForFunction(() =>
      Boolean((window as any).__reactRouterDataRouter)
    );
    await page.getByLabel('Email or handle', { exact: true }).fill(address);
    await page.getByLabel('Password', { exact: true }).fill('short');
    await page.getByRole('button', { name: 'Log in', exact: true }).click();
    await expect(
      page.getByText('Password is too short', { exact: true })
    ).toBeVisible();
    await shot(
      page,
      `flag-off-legacy-password-error-${process.env.SIGNON_VALIDATION_PHASE || 'after'}`,
      width
    );
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
