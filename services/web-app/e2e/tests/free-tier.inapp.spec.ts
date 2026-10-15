import { test, expect } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { setFreeTierFlag, setLessonPlannerFlag } from '../feature-flags';
import { createE2EPrismaClient } from '../prisma-client';

const db = createE2EPrismaClient();
const orgId = 'preview-free-classroom';
const evidence = process.env.FREE_INAPP_SHOTS;
const before = process.env.FREE_INAPP_BEFORE === '1';
async function login(page: import('@playwright/test').Page, free = true) {
  await page.context().clearCookies();
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await page
    .getByLabel('Email or handle')
    .fill(free ? 'dev.teacher.free@yawp.local' : 'dev.teacher@yawp.local');
  await page.locator('input[type="password"]').fill('yawp-dev');
  await page.getByRole('button', { name: /Log in/i }).click();
  await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === '/app', {
    timeout: 15000,
  });
}
async function capture(page: import('@playwright/test').Page, state: string) {
  if (!evidence) return;
  mkdirSync(evidence, { recursive: true });
  const file = `${state}-${before ? 'before' : 'impl'}.png`;
  const viewport = page.viewportSize()!;
  const mobileUsage =
    viewport.width === 390 &&
    (state === 'mobile-usage-opened' ||
      state === 'freetier-21-dashboard-usage-opened-warning-mobile');
  const mobileReporter =
    viewport.width === 390 &&
    state === 'freetier-45-reporter-not-in-free-classroom-mobile';
  // Match the actual exported device panels, not the multi-panel canvas:
  // board 23 grows to 1283.59px; board 46 is the 844px minimum height.
  if (mobileUsage || mobileReporter) {
    await page.setViewportSize({
      width: 390,
      height: mobileUsage ? 1284 : 844,
    });
    if (mobileUsage && !before) await assertMobileUsage(page);
  }
  if (state.startsWith('paid-lesson-planner')) {
    await page
      .getByRole('textbox', { name: 'Message the Lesson Planner' })
      .fill('A local lesson for this class.');
  }
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.fonts.ready);
  // Existing hover/focus transitions last 300ms; capture the settled layout.
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(evidence, file), animations: 'disabled' });
  appendFileSync(
    join(evidence, 'manifest.jsonl'),
    JSON.stringify({
      file,
      state,
      route: new URL(page.url()).pathname + new URL(page.url()).search,
      viewport: page.viewportSize(),
      fixture:
        'isolated local-dev free account; lifetime quota rows; no external providers',
    }) + '\n'
  );
  if (mobileUsage || mobileReporter) await page.setViewportSize(viewport);
}

async function assertMobileUsage(page: import('@playwright/test').Page) {
  const sheet = page.getByRole('dialog', { name: 'Usage', exact: true });
  await expect(sheet).toHaveCSS('position', 'fixed');
  await expect(sheet).toHaveCSS('border-top-left-radius', '16px');
  await expect
    .poll(async () => {
      const box = await sheet.boundingBox();
      return (
        box && {
          x: Math.round(box.x),
          width: Math.round(box.width),
          bottom: Math.round(box.y + box.height),
        }
      );
    })
    .toEqual({ x: 0, width: 390, bottom: page.viewportSize()!.height });
  await expect(page.locator('.free-usage-overlay')).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Close', exact: true })
  ).toBeVisible();
  // The drawer must be closed behind the modal, leaving the dashboard dimmed.
  await expect
    .poll(async () => (await page.locator('nav').boundingBox())!.x)
    .toBeLessThan(0);
  await page.keyboard.press('Tab');
  await expect
    .poll(() => sheet.evaluate((el) => el.contains(document.activeElement)))
    .toBe(true);
}

test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  await setFreeTierFlag(true);
  await setLessonPlannerFlag(true);
});
test.afterAll(() => db.$disconnect());
for (const width of [1440, 390]) {
  test(`usage, exhausted types, page controls and paid control (${width})`, async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize({ width, height: width === 390 ? 1400 : 1000 });
    const klass = await db.class.findFirstOrThrow({
      where: { school: { organizationId: orgId }, isArchived: false },
      include: { teachers: true, students: { select: { id: true } } },
    });
    const teacher = klass.teachers[0]!;
    const originalLessons = await db.lessonPlanConversation.findMany({
      where: { organizationId: orgId, deletedAt: null },
    });
    const fixturePrefix = `inapp-${width}-`;
    const fixtureUsers: string[] = [];
    const fixtureDocuments: string[] = [];
    const partialRoster = [...klass.students];
    const spareClass = await db.class.create({
      data: {
        schoolId: klass.schoolId,
        schoolYear: klass.schoolYear,
        code: `${fixturePrefix}archived`,
        isArchived: true,
      },
    });
    const gradingKey = `user:grading:${teacher.id}:h`;
    const originalBucket = await db.rateLimitBucket.findUnique({
      where: { key: gradingKey },
    });
    await db.lessonPlanConversation.updateMany({
      where: { id: { in: originalLessons.map((p) => p.id) } },
      data: { deletedAt: new Date() },
    });
    await db.lessonPlanConversation.createMany({
      data: [0, 1].map((n) => ({
        id: `${fixturePrefix}${n}`,
        organizationId: orgId,
        membershipId: teacher.id,
        title: `Local lesson ${n + 1}`,
      })),
    });
    const original = await db.freeClassroomAssignmentKindUsage.findMany({
      where: { organizationId: orgId },
    });
    try {
      for (let n = klass.students.length; n < 12; n++) {
        const user = await db.user.create({
          data: {
            name: `Local classmate ${n + 1}`,
            email: `${fixturePrefix}partial-${n}@yawp.local`,
            memberships: {
              create: {
                role: 'STUDENT',
                organizationId: orgId,
                classesAsStudent: { connect: { id: klass.id } },
              },
            },
          },
          include: { memberships: { select: { id: true } } },
        });
        fixtureUsers.push(user.id);
        partialRoster.push({ id: user.memberships[0]!.id });
      }
      for (const [kind, lifetimeCreatedCount] of [
        ['class_starter', 3],
        ['prewriting', 1],
        ['thesis_statement', 0],
      ] as const) {
        await db.freeClassroomAssignmentKindUsage.upsert({
          where: { organizationId_kind: { organizationId: orgId, kind } },
          create: { organizationId: orgId, kind, lifetimeCreatedCount },
          update: { lifetimeCreatedCount },
        });
      }
      await login(page);
      // First run: preserve the actual creation/deletion semantics, varying read fixtures only.
      await db.class.update({
        where: { id: klass.id },
        data: { students: { set: [] } },
      });
      await db.freeClassroomAssignmentKindUsage.updateMany({
        where: { organizationId: orgId },
        data: { lifetimeCreatedCount: 0 },
      });
      await db.classAssignment.updateMany({
        where: { classId: klass.id },
        data: { classId: spareClass.id },
      });
      await page.goto('/app');
      await capture(
        page,
        `freetier-17-dashboard-first-run${width === 390 ? '-mobile' : ''}`
      );
      await db.classAssignment.updateMany({
        where: { classId: spareClass.id },
        data: { classId: klass.id },
      });
      await db.class.update({
        where: { id: klass.id },
        data: { students: { set: partialRoster } },
      });
      for (const [kind, lifetimeCreatedCount] of [
        ['class_starter', 3],
        ['prewriting', 1],
        ['thesis_statement', 0],
      ] as const)
        await db.freeClassroomAssignmentKindUsage.update({
          where: { organizationId_kind: { organizationId: orgId, kind } },
          data: { lifetimeCreatedCount },
        });
      await page.goto('/app');
      await capture(
        page,
        width === 1440
          ? 'freetier-18-dashboard-in-use'
          : 'freetier-23-dashboard-mobile'
      );
      if (!before) {
        // The same lifetime count is shown on the dashboard and in usage details.
        await expect(page.getByTestId('free-assignment-tiles')).toContainText(
          '9 of 12 left'
        );
        if (width === 390)
          await page
            .getByRole('button', { name: 'Open app navigation' })
            .click();
        const usage = page.getByRole('button', { name: 'Usage', exact: true });
        await usage.focus();
        await page.keyboard.press('Enter');
        await expect(page.getByRole('dialog', { name: 'Usage' })).toContainText(
          '3 of 12 · 9 left'
        );
        if (width === 390) await assertMobileUsage(page);
        await capture(
          page,
          width === 1440
            ? 'freetier-20-dashboard-usage-opened'
            : 'mobile-usage-opened'
        );
        await page.keyboard.press('Escape');
        await expect(
          width === 390
            ? page.getByRole('button', { name: 'Open app navigation' })
            : usage
        ).toBeFocused();
        if (width === 390) {
          await page
            .getByRole('button', { name: 'Open app navigation' })
            .click();
          await usage.click();
          await page
            .getByRole('dialog', { name: 'Usage' })
            .getByRole('button', { name: 'Close', exact: true })
            .click();
          await expect(page.getByRole('dialog', { name: 'Usage' })).toHaveCount(
            0
          );
          await expect(
            page.getByRole('button', { name: 'Open app navigation' })
          ).toBeFocused();
        }
      }
      for (const [route, board] of [
        ['/app/my-classes', 'freetier-25-my-classes-my-classes'],
        [
          `/app/my-classes/${klass.id}?tab=students`,
          'freetier-26-my-classes-class-page-students',
        ],
        [
          `/app/my-classes/${klass.id}?tab=assignments`,
          'freetier-27-my-classes-class-page-assignments',
        ],
        ['/app/assignments', 'freetier-32-my-assignments-my-assignments'],
        [
          '/app/documents?status=needs-grading&reset=1',
          'freetier-39-documents-needs-grading',
        ],
        ['/app/lesson-planner', 'freetier-42-lesson-planner-3-of-5-left'],
        ['/app/reporter', 'freetier-45-reporter-not-in-free-classroom'],
      ]) {
        await db.freeClassroomAssignmentKindUsage.update({
          where: {
            organizationId_kind: { organizationId: orgId, kind: 'prewriting' },
          },
          data: { lifetimeCreatedCount: route === '/app/assignments' ? 3 : 1 },
        });
        if (route?.startsWith('/app/documents?')) {
          const deployment = await db.classAssignment.findFirstOrThrow({
            where: {
              classId: klass.id,
              assignment: { assignmentType: { kind: 'prewriting' } },
            },
            include: { assignment: true },
          });
          for (const [index, title] of [
            'My garden plan',
            'Why gardens matter',
            'The first line',
            'Places I go',
          ].entries()) {
            const doc = await db.document.create({
              data: {
                id: `${fixturePrefix}writing-${index}`,
                title,
                text: 'Local student writing for the grading queue.',
                membershipId: partialRoster[index]!.id,
                assignmentId: deployment.assignmentId,
                assignmentTypeId: deployment.assignment.assignmentTypeId,
                classAssignmentId: deployment.id,
                submissions: {
                  create: {
                    title,
                    text: 'Local student writing for the grading queue.',
                    html: '<p>Local student writing for the grading queue.</p>',
                    submittedAt: new Date('2026-10-14T12:00:00Z'),
                  },
                },
              },
            });
            fixtureDocuments.push(doc.id);
          }
        }
        await page.goto(route!);
        await capture(page, `${board}${width === 390 ? '-mobile' : ''}`);
        if (route?.startsWith('/app/documents?')) {
          await expect(
            page.getByText('My garden plan', { exact: true }).first()
          ).toBeVisible();
          await expect(
            page.getByText('Places I go', { exact: true }).first()
          ).toBeVisible();
          await db.submission.deleteMany({
            where: { documentId: { in: fixtureDocuments } },
          });
          await db.document.deleteMany({
            where: { id: { in: fixtureDocuments } },
          });
        }
        if (!before && route?.endsWith('?tab=students')) {
          const sections = page.getByRole('tablist', {
            name: 'Class sections',
          });
          await sections.getByRole('tab', { name: /^Assignments/ }).click();
          await expect(
            sections.getByRole('tab', { name: /^Assignments/ })
          ).toHaveAttribute('aria-selected', 'true');
          await sections.getByRole('tab', { name: /^Students/ }).click();
          await page
            .getByRole('button', { name: 'QR code', exact: true })
            .click();
          await expect(
            page.getByAltText('QR code for class join link')
          ).toBeVisible();
          await page
            .getByRole('button', { name: 'QR code', exact: true })
            .click();
          await page
            .getByRole('button', { name: 'Show on board', exact: true })
            .click();
          await expect(page.getByTestId('free-class-board')).toBeVisible();
          await page
            .getByRole('button', { name: 'Show on board', exact: true })
            .click();
        }
        if (!before && route === '/app/reporter') {
          await expect(page.getByTestId('free-reporter-locked')).toBeVisible();
          const card = page.getByTestId('free-reporter-card');
          await expect(card).toHaveCSS('border-radius', '12px');
          await expect(card).toHaveCSS('align-items', 'flex-start');
          await expect(card).toHaveCSS('text-align', 'left');
          const header = page
            .getByTestId('free-reporter-locked')
            .getByRole('heading', { name: 'Reporter', exact: true });
          const headerBox = (await header.boundingBox())!;
          const cardBox = (await card.boundingBox())!;
          expect(
            cardBox.y - (headerBox.y + headerBox.height)
          ).toBeLessThanOrEqual(50);
          expect(cardBox.x).toBeCloseTo(headerBox.x, 0);
          await expect(card.getByTestId('reporter-lock-badge')).toHaveCSS(
            'border-radius',
            '9999px'
          );
          await expect(card.locator('li svg')).toHaveCount(2);
          await expect(
            card.getByRole('link', { name: 'Talk to us' })
          ).toHaveCSS('border-radius', '9999px');
          await expect(page.getByRole('textbox')).toHaveCount(0);
          const response = await page.request.post('/api/domain/reporter', {
            data: {},
          });
          expect(response.ok()).toBe(false);
        }
      }
      const assignment = await db.classAssignment.findFirst({
        where: {
          classId: klass.id,
          assignment: { assignmentType: { kind: 'prewriting' } },
        },
        include: { assignment: true },
      });
      if (assignment) {
        await page.goto(`/app/assignments/${assignment.assignmentId}`);
        await capture(
          page,
          `freetier-35-my-assignments-assignment-page${width === 390 ? '-mobile' : ''}`
        );
      }
      await db.freeClassroomAssignmentKindUsage.update({
        where: {
          organizationId_kind: { organizationId: orgId, kind: 'prewriting' },
        },
        data: { lifetimeCreatedCount: 3 },
      });
      await page.goto('/app/assignments');
      await page
        .getByRole('button', { name: 'New Assignment', exact: true })
        .click();
      await capture(
        page,
        `freetier-33-my-assignments-type-picker${width === 390 ? '-mobile' : ''}`
      );
      if (!before) {
        await expect(
          page.getByRole('button', { name: /Prewriting.*None left/ })
        ).toBeDisabled();
        await page
          .getByRole('button', { name: /Class Starter.*9 of 12 left/ })
          .click();
        await expect(page.getByRole('combobox').first()).toContainText(
          'Class Starter'
        );
        await expect(
          page.getByRole('button', { name: 'Create Assignment', exact: true })
        ).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await db.freeClassroomAssignmentKindUsage.update({
        where: {
          organizationId_kind: { organizationId: orgId, kind: 'prewriting' },
        },
        data: { lifetimeCreatedCount: 3 },
      });
      await page.goto('/app');
      if (!before)
        await expect(
          page
            .getByTestId('free-assignment-tiles')
            .getByRole('button', { name: 'New Prewriting assignment' })
        ).toBeDisabled();
      await capture(
        page,
        `freetier-19-dashboard-a-type-is-used-up${width === 390 ? '-mobile' : ''}`
      );
      if (!before) {
        const prewriting = await db.assignmentType.findUniqueOrThrow({
          where: { kind: 'prewriting' },
        });
        const response = await page.request.post(
          '/api/assignments/create.data',
          {
            form: {
              intent: 'create-assignment',
              classIds: klass.id,
              assignmentTypeId: prewriting.id,
              title: 'Blocked local assignment',
              prompt: 'Local quota enforcement check.',
              submitForGrade: 'true',
              pointValue: '100',
            },
          }
        );
        expect(response.status()).toBe(403);
        expect(
          await db.assignment.count({
            where: { title: 'Blocked local assignment' },
          })
        ).toBe(0);
      }

      if (!before) {
        if (width === 390)
          await page
            .getByRole('button', { name: 'Open app navigation' })
            .click();
        await page.getByRole('button', { name: 'Usage', exact: true }).click();
        if (width === 390) {
          await assertMobileUsage(page);
          await expect(
            page.getByRole('dialog', { name: 'Usage' })
          ).toContainText('3 of 3 · none left');
        }
        await capture(
          page,
          `freetier-21-dashboard-usage-opened-warning${width === 390 ? '-mobile' : ''}`
        );
        if (width === 390) {
          await page
            .locator('.free-usage-overlay')
            .click({ position: { x: 10, y: 10 } });
          await expect(page.getByRole('dialog', { name: 'Usage' })).toHaveCount(
            0
          );
          await expect(
            page.getByRole('button', { name: 'Open app navigation' })
          ).toBeFocused();
        } else await page.keyboard.press('Escape');
      }
      if (assignment?.assignment.assignmentTypeId) {
        const type = await db.assignmentType.findUniqueOrThrow({
          where: { id: assignment.assignment.assignmentTypeId },
        });
        const originalCount =
          await db.freeClassroomAssignmentKindUsage.findUnique({
            where: {
              organizationId_kind: { organizationId: orgId, kind: type.kind! },
            },
          });
        const cap = type.kind === 'class_starter' ? 12 : 3;
        await db.freeClassroomAssignmentKindUsage.upsert({
          where: {
            organizationId_kind: { organizationId: orgId, kind: type.kind! },
          },
          create: {
            organizationId: orgId,
            kind: type.kind!,
            lifetimeCreatedCount: cap,
          },
          update: { lifetimeCreatedCount: cap },
        });
        await page.goto(`/app/assignments/${assignment.assignmentId}`);
        if (!before)
          await expect(
            page.getByRole('button', { name: 'Duplicate', exact: true })
          ).toBeDisabled();
        await capture(
          page,
          `freetier-36-my-assignments-assignment-page-type-used-up${width === 390 ? '-mobile' : ''}`
        );
        if (originalCount)
          await db.freeClassroomAssignmentKindUsage.update({
            where: {
              organizationId_kind: { organizationId: orgId, kind: type.kind! },
            },
            data: { lifetimeCreatedCount: originalCount.lifetimeCreatedCount },
          });
      }
      for (const [kind, lifetimeCreatedCount] of [
        ['class_starter', 12],
        ['prewriting', 3],
        ['thesis_statement', 3],
      ] as const)
        await db.freeClassroomAssignmentKindUsage.update({
          where: { organizationId_kind: { organizationId: orgId, kind } },
          data: { lifetimeCreatedCount },
        });
      await page.goto('/app/assignments');
      if (!before)
        await expect(
          page.getByRole('button', { name: 'New Assignment', exact: true })
        ).toBeDisabled();
      await capture(
        page,
        `freetier-34-my-assignments-all-used${width === 390 ? '-mobile' : ''}`
      );
      await db.lessonPlanConversation.createMany({
        data: [2, 3, 4].map((n) => ({
          id: `${fixturePrefix}${n}`,
          organizationId: orgId,
          membershipId: teacher.id,
          title: `Local lesson ${n + 1}`,
        })),
      });
      await page.goto('/app/lesson-planner');
      if (!before) {
        await expect(page.getByTestId('free-lesson-remaining')).toContainText(
          'You have used all 5 lesson plans'
        );
        await expect(
          page.getByRole('textbox', { name: 'Message the Lesson Planner' })
        ).toBeDisabled();
      }
      await capture(
        page,
        `freetier-43-lesson-planner-none-left${width === 390 ? '-mobile' : ''}`
      );
      await db.class.update({
        where: { id: klass.id },
        data: { students: { set: [] } },
      });
      for (let n = 0; n < 35; n++) {
        const user = await db.user.create({
          data: {
            name: `Local student ${n + 1}`,
            email: `${fixturePrefix}${n}@yawp.local`,
            memberships: {
              create: {
                role: 'STUDENT',
                organizationId: orgId,
                classesAsStudent: { connect: { id: klass.id } },
              },
            },
          },
        });
        fixtureUsers.push(user.id);
      }
      await page.goto(`/app/my-classes/${klass.id}?tab=students`);
      if (!before)
        await expect(
          page.getByRole('status').filter({ hasText: 'This class is full.' })
        ).toBeVisible();
      await capture(
        page,
        `freetier-28-my-classes-class-page-full${width === 390 ? '-mobile' : ''}`
      );
      await db.class.update({
        where: { id: klass.id },
        data: { students: { set: partialRoster } },
      });
      await db.rateLimitBucket.upsert({
        where: { key: gradingKey },
        create: {
          key: gradingKey,
          capacity: 80,
          tokens: 0,
          refillPerMs: 80 / 3_600_000,
          lastRefillAt: new Date(),
        },
        update: {
          capacity: 80,
          tokens: 0,
          refillPerMs: 80 / 3_600_000,
          lastRefillAt: new Date(),
        },
      });
      await page.goto('/app');
      if (!before)
        await expect(
          page.getByText(/Grading assistant paused for/)
        ).toBeVisible();
      await capture(
        page,
        `freetier-22-dashboard-grading-paused${width === 390 ? '-mobile' : ''}`
      );
      await db.rateLimitBucket.deleteMany({ where: { key: gradingKey } });
      // Viewing usage never consumes assignments.
      expect(
        await db.freeClassroomAssignmentKindUsage.findUniqueOrThrow({
          where: {
            organizationId_kind: {
              organizationId: orgId,
              kind: 'class_starter',
            },
          },
        })
      ).toMatchObject({ lifetimeCreatedCount: 12 });
      await setFreeTierFlag(false);
      await page.goto('/app');
      await expect(page.locator('[data-free-account]')).toHaveCount(0);
      await capture(page, `flag-off-dashboard-${width}`);
      await setFreeTierFlag(true);
      await login(page, false);
      for (const route of [
        '/app',
        '/app/my-classes',
        '/app/assignments',
        '/app/documents',
        '/app/lesson-planner',
        '/app/reporter',
      ]) {
        await page.goto(route);
        await expect(page.locator('[data-free-account]')).toHaveCount(0);
        await capture(
          page,
          `paid-${route.split('/').pop() || 'dashboard'}-${width}`
        );
      }
    } finally {
      await db.submission.deleteMany({
        where: { documentId: { in: fixtureDocuments } },
      });
      await db.document.deleteMany({ where: { id: { in: fixtureDocuments } } });
      await db.classAssignment.updateMany({
        where: { classId: spareClass.id },
        data: { classId: klass.id },
      });
      await db.class.delete({ where: { id: spareClass.id } });
      await setFreeTierFlag(true);
      await db.class.update({
        where: { id: klass.id },
        data: { students: { set: klass.students } },
      });
      await db.orgMembership.deleteMany({
        where: { userId: { in: fixtureUsers } },
      });
      await db.user.deleteMany({ where: { id: { in: fixtureUsers } } });
      await db.rateLimitBucket.deleteMany({ where: { key: gradingKey } });
      if (originalBucket)
        await db.rateLimitBucket.create({ data: originalBucket });
      await db.lessonPlanConversation.deleteMany({
        where: { id: { startsWith: fixturePrefix } },
      });
      await db.lessonPlanConversation.updateMany({
        where: { id: { in: originalLessons.map((p) => p.id) } },
        data: { deletedAt: null },
      });
      await db.freeClassroomAssignmentKindUsage.deleteMany({
        where: { organizationId: orgId },
      });
      await db.freeClassroomAssignmentKindUsage.createMany({ data: original });
    }
  });
}
