import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';
const db = createE2EPrismaClient();
const org = 'preview-free-classroom';
const baseline = process.env.FTO_LIMITS_BEFORE === '1';
async function flag(name: string, value: unknown) {
  await db.setting.upsert({
    where: { name: `feature_flag.${name}` },
    create: { name: `feature_flag.${name}`, value: JSON.stringify(value) },
    update: { value: JSON.stringify(value) },
  });
}
async function login(page: Page, free = true) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page
    .getByLabel('Email or handle')
    .fill(free ? 'dev.teacher.free@yawp.local' : 'dev.teacher@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app');
}
async function shot(page: Page, name: string) {
  const dir = process.env.FTO_LIMITS_SHOTS;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: join(dir, `${name}-${baseline ? 'before' : 'impl'}.png`),
    animations: 'disabled',
  });
}
// Each flow owns its approval precondition, including after an interrupted run.
test.beforeEach(async () => {
  await db.freeTierApplication.updateMany({
    where: { organizationId: org },
    data: { status: 'APPROVED' },
  });
});
test.afterAll(async () => {
  await flag('free-tier-onboarding-v2', false);
  await db.$disconnect();
});
test('monthly dashboard guidance, classes, advocate pack and keyboard/mobile dialog', async ({
  page,
  context,
}) => {
  await flag('free_tier', true);
  await flag('free-tier-inapp-v2', true);
  await flag('lesson_planner', true);
  await flag('free-tier-onboarding-v2', { mode: 'targeted', orgIds: [org] });
  const emptyClass = await db.class.findFirstOrThrow({
    where: { school: { organizationId: org }, isArchived: false },
  });
  await db.class.update({
    where: { id: emptyClass.id },
    data: { students: { set: [] } },
  });
  await login(page);
  for (const [width, height, label] of [
    [1440, 1000, 'desktop'],
    [390, 844, 'mobile'],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/app');
    await shot(page, `dashboard-${label}`);
    if (baseline) {
      for (const [route, name] of [
        ['/app/my-classes', 'classes'],
        ['/app/assignments', 'assignments'],
        ['/app/lesson-planner', 'lesson-planner'],
        ['/app/reporter', 'reporter'],
      ]) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await shot(page, `${name}-${label}`);
      }
      continue;
    }
    await expect(
      page.getByText('Your class, assignments, and grading in one place.')
    ).toBeVisible();
    await expect(page.getByTestId('class-code').first()).toBeInViewport();
    const opener = page
      .getByRole('button', {
        name: 'Add your students to your class',
        exact: true,
      })
      .first();
    await opener.click();
    const dialog = page.getByRole('dialog', {
      name: 'Add your students to your class',
    });
    await expect(dialog).toBeVisible();
    const klass = await db.class.findFirstOrThrow({
      where: { school: { organizationId: org }, isArchived: false },
    });
    await expect(dialog.getByTestId('invitation-class-code')).toHaveText(
      klass.code
    );
    await expect(dialog.locator('ol > li')).toHaveCount(3);
    await shot(page, `student-dialog-${label}`);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await dialog.getByRole('button', { name: 'Copy class code' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Class code copied');
    await dialog.getByRole('button', { name: 'Present', exact: true }).click();
    await expect(
      dialog.getByRole('button', { name: 'Exit Present mode' })
    ).toHaveAttribute('aria-pressed', 'true');
    await shot(page, `present-${label}`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(opener).toBeFocused();
    await page.goto('/app/my-classes');
    await expect(page.getByTestId('class-code').first()).toHaveText(klass.code);
    await expect(page.getByTestId('class-code').first()).toBeInViewport();
    await expect(page.getByText('35 seats available').first()).toBeVisible();
    await shot(page, `classes-${label}`);
    await page
      .getByRole('button', { name: /Class options/ })
      .first()
      .click();
    await page
      .getByRole('menuitem', { name: 'Add your students to your class' })
      .click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: /Class options/ }).first()
    ).toBeFocused();
    await page.goto('/app/assignments');
    await shot(page, `assignments-${label}`);
    await page.getByTestId('my-assignments-new-assignment').click();
    await expect(
      page.getByRole('dialog').getByText('Unlimited assignments').first()
    ).toBeVisible();
    await shot(page, `type-picker-${label}`);
    await page.keyboard.press('Escape');
    await page.goto('/app/lesson-planner');
    await shot(page, `lesson-planner-${label}`);
    await page.goto('/app/reporter');
    await expect(page.getByTestId('reporter-monthly-remaining')).toBeVisible();
    await expect(page.getByTestId('free-reporter-locked')).toHaveCount(0);
    await shot(page, `reporter-${label}`);
  }
  if (baseline) {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/app');
    await page.getByRole('button', { name: 'Usage', exact: true }).click();
    await shot(page, 'monthly-usage');
    return;
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/app');
  await page.getByRole('button', { name: 'Usage', exact: true }).click();
  const usage = page.getByLabel('Usage', { exact: true }).last();
  await expect(usage.getByText('Reporter', { exact: true })).toBeVisible();
  await expect(usage.getByText('Students', { exact: true })).toHaveCount(0);
  await expect(usage.getByText('Class Starter', { exact: true })).toHaveCount(
    0
  );
  await shot(page, 'monthly-usage');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: 'Ready for full access?' }).click();
  await expect(
    page.getByRole('heading', { name: 'Advocate Pack' })
  ).toBeVisible();
  await expect(page.getByText('Take this to your administrator')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Refer a colleague' })
  ).toBeVisible();
  await expect(
    page.getByRole('main').getByRole('link', { name: 'Need more? Talk to us' })
  ).toHaveAttribute('href', /mailto:hello@yawp.school\?subject=/);
  await shot(page, 'advocate-pack');
});
for (const control of ['flag-off', 'untargeted', 'paid', 'pending'] as const)
  test(`compatibility ${control}`, async ({ page }) => {
    await flag('free_tier', true);
    await flag('free-tier-inapp-v2', true);
    await flag(
      'free-tier-onboarding-v2',
      control === 'flag-off'
        ? false
        : {
            mode: 'targeted',
            orgIds: control === 'untargeted' ? ['another-org'] : [org],
          }
    );
    if (control === 'pending')
      await db.freeTierApplication.updateMany({
        where: { organizationId: org },
        data: { status: 'SENT' },
      });
    try {
      if (control === 'pending') {
        // Main denies the dashboard and opens the server-enforced locked preview.
        await page.context().clearCookies();
        await page.goto('/auth/login');
        await page.waitForLoadState('networkidle');
        await page
          .getByLabel('Email or handle')
          .fill('dev.teacher.free@yawp.local');
        await page.locator('input[type="password"]').fill('yawp-dev');
        await page.getByRole('button', { name: /Log in/i }).click();
        await page.waitForURL(/\/app\/free-tier\/preview/);
      } else await login(page, control !== 'paid');
      await expect(
        page.getByRole('link', { name: 'Ready for full access?' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', {
          name: 'Add your students to your class',
          exact: true,
        })
      ).toHaveCount(0);
      await shot(page, control);
    } finally {
      if (control === 'pending')
        await db.freeTierApplication.updateMany({
          where: { organizationId: org },
          data: { status: 'APPROVED' },
        });
    }
  });

test('monthly zero/exhausted direct requests, saved reads and unlimited assignment API', async ({
  page,
}) => {
  test.skip(
    baseline,
    'Consumer behavior is implemented after the main-baseline captures'
  );
  await flag('free_tier', true);
  await flag('free-tier-inapp-v2', true);
  await flag('lesson_planner', true);
  await flag('free-tier-onboarding-v2', { mode: 'targeted', orgIds: [org] });
  await login(page);
  const klass = await db.class.findFirstOrThrow({
    where: { school: { organizationId: org }, isArchived: false },
    include: { teachers: true },
  });
  const limitsName = 'free_tier.limits.v1';
  const previousLimits = await db.setting.findUnique({
    where: { name: limitsName },
  });
  const setLimits = async (
    lessonPlannerMonthly: number,
    reporterMonthly: number
  ) => {
    const value = JSON.stringify({
      studentSeatCap: 35,
      lessonPlannerMonthly,
      reporterMonthly,
      version: 1,
      updatedAt: new Date().toISOString(),
      updatedByEmail: 'local@example.test',
    });
    await db.setting.upsert({
      where: { name: limitsName },
      create: { name: limitsName, value },
      update: { value },
    });
  };
  const originalUsage = await db.freeClassroomAssignmentKindUsage.findMany({
    where: { organizationId: org },
  });
  const createdAssignments: string[] = [];
  const seededLessons: string[] = [];
  const seededOperations: string[] = [];
  let savedReportId: string | undefined;
  let reservationId: string | undefined;
  try {
    const invitation = await db.invitation.create({
      data: {
        type: 'onboard-student',
        target: 'monthly-seats@example.test',
        secret: 'local-only',
        algorithm: 'SHA256',
        digits: 6,
        period: 600,
        charSet: '0123456789',
        studentClassId: klass.id,
        organizationId: org,
      },
    });
    reservationId = invitation.id;
    await page.goto('/app/my-classes');
    await expect(page.getByText('34 seats available')).toBeVisible();
    await shot(page, 'seats-reserved');
    await db.invitation.delete({ where: { id: reservationId } });
    reservationId = undefined;
    // Lifetime counts deliberately exceed each legacy cap before hitting real HTTP routes.
    for (const kind of ['class_starter', 'prewriting', 'thesis_statement']) {
      await db.freeClassroomAssignmentKindUsage.upsert({
        where: { organizationId_kind: { organizationId: org, kind } },
        create: { organizationId: org, kind, lifetimeCreatedCount: 99 },
        update: { lifetimeCreatedCount: 99 },
      });
      const type = await db.assignmentType.findFirstOrThrow({
        where: { kind },
      });
      const response = await page.request.post('/api/assignments/create', {
        form: {
          intent: 'create-assignment',
          assignmentTypeId: type.id,
          classIds: klass.id,
          title: 'Local monthly policy check',
          prompt: 'Write a focused response.',
          submitForGrade: 'true',
        },
      });
      expect(response.status(), await response.text()).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      const created = await db.assignment.findFirstOrThrow({
        where: {
          title: 'Local monthly policy check',
          assignmentTypeId: type.id,
          classAssignments: { some: { classId: klass.id } },
        },
        orderBy: { createdAt: 'desc' },
      });
      createdAssignments.push(created.id);
    }
    await page.goto('/app');
    await expect(
      page
        .getByTestId('free-assignment-tiles')
        .getByRole('button', { name: /New .* assignment/ })
    ).toHaveCount(3);
    for (const button of await page
      .getByTestId('free-assignment-tiles')
      .getByRole('button', { name: /New .* assignment/ })
      .all())
      await expect(button).toBeEnabled();
    await shot(page, 'dashboard-above-old-caps');
    // The displayed meter can be stale when a competing request consumes the
    // last use. The actual streamed browser request must show the server refusal.
    await setLimits(5, 2);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');
    await page
      .getByLabel('Message the Lesson Planner')
      .fill('A lesson after the last use');
    await setLimits(0, 0);
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(
      page.getByText('You have used all your monthly uses.', { exact: false })
    ).toBeVisible();
    await expect(
      page.getByText('That lesson did not come back.', { exact: false })
    ).toHaveCount(0);
    await shot(page, 'lesson-planner-stream-denied');
    // Replay a completed request through the real action and streaming UI. No
    // provider runs; the saved conversation supplies the subsequent loader read.
    await setLimits(5, 2);
    const replayText = 'Your original saved lesson.';
    const replayLesson = await db.lessonPlanConversation.create({
      data: {
        organizationId: org,
        membershipId: klass.teachers[0].id,
        title: 'Local replay draft',
        messages: { create: [{ role: 'assistant', content: replayText }] },
      },
      include: { messages: true },
    });
    seededLessons.push(replayLesson.id);
    let replayName = '';
    await page.route(
      '**/api/domain/lesson-planner',
      async (route) => {
        const form = new URLSearchParams(route.request().postData()!);
        replayName =
          `free_tier.monthly.v1:${org}:lesson-planner:` +
          createHash('sha256')
            .update(`${klass.teachers[0].id}:${form.get('requestId')}`)
            .digest('hex');
        seededOperations.push(replayName);
        const fingerprint = createHash('sha256')
          .update(JSON.stringify({ message: form.get('message') }))
          .digest('hex');
        const now = new Date();
        await db.setting.create({
          data: {
            name: replayName,
            valueType: 'json',
            value: JSON.stringify({
              period: new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
              ).toISOString(),
              fingerprint,
              token: 'local-replay-fixture',
              status: 'completed',
              expiresAt: now.toISOString(),
              conversationId: replayLesson.id,
              payload: {
                conversationId: replayLesson.id,
                messageId: replayLesson.messages[0].id,
                reply: replayText,
                isNewConversation: true,
              },
            }),
          },
        });
        await route.continue();
      },
      { times: 1 }
    );
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');
    await page
      .getByLabel('Message the Lesson Planner')
      .fill('Replay this saved lesson');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByText(replayText, { exact: true })).toBeVisible();
    await expect(
      page.getByText('That lesson did not come back.', { exact: false })
    ).toHaveCount(0);
    await shot(page, 'lesson-planner-stream-replay');
    await db.lessonPlanConversation.delete({ where: { id: replayLesson.id } });
    await db.setting.delete({ where: { name: replayName } });
    await setLimits(0, 0);
    for (const route of [
      '/api/domain/reporter',
      '/api/domain/lesson-planner',
    ]) {
      const response = await page.request.post(route, {
        form: {
          intent: 'chat',
          message: 'Denied before provider work',
          requestId: crypto.randomUUID(),
        },
      });
      expect(response.status(), await response.text()).toBe(403);
    }
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const route of ['lesson-planner', 'reporter']) {
        await page.goto(`/app/${route}`);
        await shot(page, `${route}-zero-${width}`);
      }
      if (width === 390) {
        await page.getByRole('button', { name: 'Open app navigation' }).click();
        await page.getByRole('button', { name: 'Usage', exact: true }).click();
        await shot(page, 'monthly-usage-zero-mobile');
        await page.keyboard.press('Escape');
      }
    }
    await setLimits(2, 2);
    const now = new Date();
    const period = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    ).toISOString();
    for (let i = 0; i < 2; i++) {
      const lesson = await db.lessonPlanConversation.create({
        data: {
          organizationId: org,
          membershipId: klass.teachers[0].id,
          title: 'Local metered draft',
          ...(i === 1 ? { deletedAt: now } : {}),
        },
      });
      seededLessons.push(lesson.id);
      const name = `free_tier.monthly.v1:${org}:reporter:e2e-${crypto.randomUUID()}`;
      seededOperations.push(name);
      await db.setting.create({
        data: {
          name,
          valueType: 'json',
          value: JSON.stringify({
            period,
            fingerprint: 'local-fixture',
            token: 'local-fixture',
            status: 'completed',
            expiresAt: now.toISOString(),
            payload: { reply: 'Local saved result' },
          }),
        },
      });
    }
    const saved = await db.reporterConversation.create({
      data: {
        organizationId: org,
        membershipId: klass.teachers[0].id,
        title: 'Local saved report',
        messages: {
          create: [
            { role: 'assistant', content: 'Your saved report is readable.' },
          ],
        },
      },
    });
    savedReportId = saved.id;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (const route of ['lesson-planner', 'reporter']) {
        await page.goto(`/app/${route}`);
        await shot(page, `${route}-exhausted-${width}`);
      }
    }
    await page.goto(`/app/reporter?c=${saved.id}`);
    await expect(
      page.getByText('Your saved report is readable.')
    ).toBeVisible();
    const continued = await page.request.post('/api/domain/reporter', {
      form: {
        message: 'Another report',
        conversationId: saved.id,
        requestId: crypto.randomUUID(),
      },
    });
    expect(continued.status()).toBe(403);
    await db.freeTierApplication.updateMany({
      where: { organizationId: org },
      data: { status: 'SENT' },
    });
    await setLimits(5, 2);
    const pendingPlan = await page.request.post('/api/domain/lesson-planner', {
      form: {
        message: 'Pending direct request',
        requestId: crypto.randomUUID(),
      },
    });
    expect(pendingPlan.status()).toBe(403);
    const denied = await page.request.post('/api/domain/reporter', {
      form: {
        message: 'Pending direct request',
        requestId: crypto.randomUUID(),
      },
    });
    expect(denied.status()).toBe(403);
    expect(await denied.json()).toMatchObject({ error: 'approval_required' });
    // Existing conversations and repeated streamed calls cannot bypass the lock.
    const usageBefore = await db.setting.findMany({
      where: { name: { startsWith: 'free_tier.monthly.' } },
      orderBy: { name: 'asc' },
    });
    const messagesBefore = await db.reporterMessage.count({
      where: { conversationId: saved.id },
    });
    const pendingRequestId = crypto.randomUUID();
    for (let attempt = 0; attempt < 2; attempt++) {
      for (const route of ['lesson-planner', 'reporter']) {
        const response = await page.request.post(`/api/domain/${route}`, {
          form: {
            message: 'Pending saved conversation retry',
            conversationId: saved.id,
            requestId: pendingRequestId,
            stream: '1',
          },
        });
        expect(response.status()).toBe(403);
        expect(await response.json()).toMatchObject({ error: 'approval_required' });
      }
    }
    expect(await db.reporterMessage.count({
      where: { conversationId: saved.id },
    })).toBe(messagesBefore);
    expect(await db.setting.findMany({
      where: { name: { startsWith: 'free_tier.monthly.' } },
      orderBy: { name: 'asc' },
    })).toEqual(usageBefore);
  } finally {
    await db.freeTierApplication.updateMany({
      where: { organizationId: org },
      data: { status: 'APPROVED' },
    });
    if (reservationId)
      await db.invitation.deleteMany({ where: { id: reservationId } });
    for (const row of originalUsage)
      await db.freeClassroomAssignmentKindUsage.update({
        where: { organizationId_kind: { organizationId: org, kind: row.kind } },
        data: { lifetimeCreatedCount: row.lifetimeCreatedCount },
      });
    await db.assignment.deleteMany({
      where: { id: { in: createdAssignments } },
    });
    await db.lessonPlanConversation.deleteMany({
      where: { id: { in: seededLessons } },
    });
    await db.setting.deleteMany({ where: { name: { in: seededOperations } } });
    if (savedReportId)
      await db.reporterConversation.delete({ where: { id: savedReportId } });
    if (previousLimits)
      await db.setting.update({
        where: { name: limitsName },
        data: { value: previousLimits.value },
      });
    else await db.setting.deleteMany({ where: { name: limitsName } });
  }
});
