/**
 * Lesson Planner changes from Brian's third run and the stack page redesign
 * (docs/plans/2026-10-19-lesson-planner-brian-run-3.md).
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import {
  setLessonPlannerReviewFlag,
  type LessonPlannerReviewFlag,
} from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const REVIEW_FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_intake_v2',
  'lesson_planner_stack_v2',
  'lesson_planner_deck_v2',
  'lesson_planner_stack_panel',
  'lesson_planner_plan_export_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_share',
  'lesson_planner_run_show',
  'lesson_planner_templates',
  'lesson_planner_deck_gallery',
];

async function stackV3On() {
  await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
  await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
}

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };


export async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Day One') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        periodMinutes: 50,
        lessonClassLabel: 'English 10 · Period 3',
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 9, 19, 10, 0, index)),
          })),
        },
      },
      select: {
        id: true,
        messages: {
          where: { role: 'assistant' },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        },
      },
    });
    return {
      conversationId: conversation.id,
      assistantIds: conversation.messages.map((message) => message.id),
    };
  } finally {
    await prisma.$disconnect();
  }
}

async function clearLessonPlans(membershipId: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.lessonPlanConversation.deleteMany({ where: { membershipId } });
    // Templates outlive their lesson, so a retry would otherwise list two.
    await prisma.lessonPlanTemplate.deleteMany({ where: { membershipId } });
  } finally {
    await prisma.$disconnect();
  }
}

/** Day one, every piece added through the real "Add everything" path. */
async function seedDayOneStack(
  page: import('@playwright/test').Page,
  e2eContext: Ctx
) {
  const { conversationId, assistantIds } = await seedConversation(e2eContext, [
    { role: 'user', content: 'Day one of The Things They Carried, English 10, 50 minutes.' },
    { role: 'assistant', content: DAY_ONE_REPLY },
  ]);
  const response = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId, messageId: assistantIds[0]! },
  });
  expect(response.ok()).toBe(true);
  return { conversationId, assistantIds };
}

test.describe("Lesson Planner — Brian's third run", () => {
  test.afterEach(async ({ e2eContext }) => {
    await clearLessonPlans(e2eContext.teacherMembershipId);
    for (const flag of REVIEW_FLAGS) {
      await setLessonPlannerReviewFlag(flag, false);
    }
  });

  test.describe('Phase 0: times and cards are right on the stack page', () => {
    test('the header sums the steps, the hook keeps 15 minutes, and every step has a time', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      await expect(page.locator('header').getByText(/Period 3 · 50 min/)).toBeVisible();
      await page.getByRole('button', { name: 'Outline', exact: true }).click();
      const outline = page.getByTestId('packet-outline');
      const hook = outline.locator('li').filter({ hasText: 'Hook activity' });
      await expect(hook).toContainText('15 min');
      await expect(outline.locator('li').filter({ hasText: 'Historical context' })).toContainText('4 min');
      const times = outline.locator('li > span:first-child');
      await expect(times).toHaveCount(8);
      for (const time of await times.all()) await expect(time).toHaveText(/\d+ min/);
      // A short, real title for Daily Pages, never the prompt cut mid-word.
      await expect(outline).toContainText('Daily Pages: O’Brien lists what every soldier carries');
      await expect(outline).not.toContainText('…');
    });

    test('the Closing card holds only the closing', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      const closing = page.getByTestId('packet-section').filter({ hasText: 'one object, one sentence' });
      await expect(closing).toHaveCount(1);
      await expect(closing).not.toContainText('Total:');
      await expect(closing).not.toContainText('Want to refine');
      await expect(closing).not.toContainText('have to use all of these');
    });

    test('the make-up link sits under the stack, not inside the handout panel', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(
        page.getByRole('link', { name: 'Send this lesson to a student who missed class' })
      ).toHaveCount(1);
      await page.getByRole('button', { name: 'Create handouts', exact: true }).click();
      await expect(
        page.getByTestId('student-handout').getByRole('link', {
          name: 'Send this lesson to a student who missed class',
        })
      ).toHaveCount(0);
    });
  });

  test.describe('Phase 1: the planner chat', () => {
    const PLAN_REPLY = `I have everything I need. Here's the plan.\n\n${DAY_ONE_REPLY}`;

    async function openDayOneChat(
      page: import('@playwright/test').Page,
      e2eContext: Ctx & { teacherEmail: string },
      signIn: (email: string, password: string) => Promise<void>
    ) {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const seeded = await seedConversation(e2eContext, [
        { role: 'user', content: 'Day one of The Things They Carried, English 10, 50 minutes.' },
        { role: 'assistant', content: PLAN_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${seeded.conversationId}`);
      return seeded;
    }

    test('a full lesson opens with what to do with it, not "I have everything I need"', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await openDayOneChat(page, e2eContext, signIn);
      await expect(page.getByTestId('plan-framing')).toHaveText(
        "Here's a full lesson. You don't have to use all of it. Give it a quick read first, then add the pieces you want to your stack, or take the whole thing."
      );
      await expect(page.getByText('I have everything I need')).toHaveCount(0);
    });

    test('the hook has its own Add to stack, and the summary list says the same', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await openDayOneChat(page, e2eContext, signIn);
      const hook = page.getByTestId('plan-segment').filter({ hasText: 'Hook activity' });
      await expect(hook.getByTestId('segment-toggle')).toHaveText('Add to stack');
      await hook.getByTestId('segment-toggle').click();
      await expect(hook.getByTestId('segment-toggle')).toHaveText('In the stack');
      const listed = page.getByTestId('plan-step').filter({ hasText: 'Hook activity' });
      await expect(listed.getByTestId('plan-step-toggle')).toHaveText('In the stack');
    });

    test('adding from a card marks its step; the framing step is its three notes', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await openDayOneChat(page, e2eContext, signIn);
      await page
        .getByTestId('daily-pages-card')
        .filter({ hasText: 'nobody else can see' })
        .getByTestId('daily-pages-stack-toggle')
        .click();
      const starter = page.getByTestId('plan-segment').filter({ hasText: 'Class starter' });
      await expect(starter.getByTestId('segment-toggle')).toHaveText('In the stack');

      const framing = page.getByTestId('plan-segment').filter({ hasText: 'Framing' });
      await framing.getByTestId('segment-toggle').click();
      await expect(framing.getByTestId('segment-toggle')).toHaveText('In the stack');
      await expect(page.getByTestId('material-card').filter({ hasText: 'Historical context' })).toContainText(
        'In the stack'
      );
    });

    test('removing on the stack page shows in the open chat', async ({ page, signIn, e2eContext, context }) => {
      const { conversationId } = await openDayOneChat(page, e2eContext, signIn);
      const hook = page.getByTestId('plan-segment').filter({ hasText: 'Hook activity' });
      const filed = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await hook.getByTestId('segment-toggle').click();
      expect((await filed).ok()).toBe(true);
      await expect(hook.getByTestId('segment-toggle')).toHaveText('In the stack');

      const stack = await context.newPage();
      await stack.goto(`/app/lesson-planner/${conversationId}/packet`);
      // The hook is the only piece; its title is an editable field.
      await expect(stack.getByTestId('packet-section')).toHaveCount(1);
      await stack.getByTestId('section-remove').click();
      await expect(stack.getByTestId('packet-section')).toHaveCount(0);
      // Let the undo window close so the removal is real.
      await stack.waitForTimeout(6500);

      await page.bringToFront();
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expect(hook.getByTestId('segment-toggle')).toHaveText('Add to stack');
    });

    test('"Add everything" twice files nothing twice', async ({ page, signIn, e2eContext }) => {
      const { conversationId } = await openDayOneChat(page, e2eContext, signIn);
      const addAll = page.getByRole('button', { name: 'Add everything to the stack' });
      const filed = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await addAll.click();
      expect((await filed).ok()).toBe(true);
      await expect(page.getByText('Everything is in the stack')).toBeVisible();
      const prisma = createE2EPrismaClient();
      try {
        const first = await prisma.lessonPlanMaterial.count({ where: { conversationId } });
        const response = await page.request.post('/api/domain/lesson-planner/packet', {
          form: { intent: 'keep-all', conversationId, messageId: (await prisma.lessonPlanMessage.findFirstOrThrow({ where: { conversationId, role: 'assistant' } })).id },
        });
        expect(response.ok()).toBe(true);
        expect(await prisma.lessonPlanMaterial.count({ where: { conversationId } })).toBe(first);
        expect(first).toBe(8);
      } finally {
        await prisma.$disconnect();
      }
    });

    test('the closing exit ticket can be created in Yawp!, then says so', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const closing = page.getByTestId('packet-section').filter({ hasText: 'one object, one sentence' });
      const create = closing.getByTestId('stack-create-assignment');
      await expect(create).toHaveText('Create this exit ticket in Yawp!');
      const href = await create.getAttribute('href');
      expect(href).toContain('fromPiece=m%3A');

      const prisma = createE2EPrismaClient();
      let materialId: string;
      try {
        materialId = (await prisma.lessonPlanMaterial.findFirstOrThrow({
          where: { conversationId, kind: 'step', title: { startsWith: 'Closing' } },
        })).id;
      } finally {
        await prisma.$disconnect();
      }
      const marked = await page.request.post('/api/domain/lesson-planner/packet', {
        form: {
          intent: 'mark-created',
          conversationId,
          materialId,
          yawpHref: new URL(href!, 'http://x').pathname,
        },
      });
      expect(marked.ok()).toBe(true);
      await page.reload();
      await expect(
        page.getByTestId('packet-section').filter({ hasText: 'one object, one sentence' }).getByTestId('stack-create-assignment')
      ).toHaveText('Created in Yawp! · Open');
    });
  });

  test.describe('Phase 2: the stack page is the run of show', () => {
    const SWAP_REPLY = [
      'Two more you could use.',
      '',
      '```yawp-daily-pages',
      'kind: class-starter',
      'title: The heaviest thing you’ve carried',
      'Write about something heavy you once carried, real or not.',
      '```',
    ].join('\n');

    test('flag off: the stack v2 page, unchanged', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('build-from-stack')).toBeVisible();
      await expect(page.getByTestId('stack-v3')).toHaveCount(0);
    });

    test('the time bar, the writing meter and the run of show add up', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);

      await expect(page.getByTestId('stack-v3')).toBeVisible();
      await expect(page.getByTestId('time-total')).toHaveText('50');
      await expect(page.getByTestId('time-status')).toHaveText('Right on time');
      await expect(page.getByTestId('time-block')).toHaveCount(8);
      await expect(page.getByTestId('writing-strip')).toContainText('20% of class is writing · 10 min');
      await expect(page.getByTestId('writing-strip')).toContainText('From Class Starter + Daily Pages');
      const cards = page.getByTestId('run-card');
      await expect(cards).toHaveCount(8);
      await expect(cards.nth(1).getByTestId('run-card-start')).toHaveText('05');
      await expect(cards.nth(1).getByTestId('step-minutes')).toHaveText('15 min');
      await expect(cards.nth(0).getByTestId('writing-badge')).toBeVisible();
      await expect(cards.nth(1).getByTestId('writing-badge')).toHaveCount(0);
      await expect(page.getByTestId('stack-chip-class')).toHaveText('English 10 · Period 3');
    });

    test('the stepper changes a step, the total and the status', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const hook = page.getByTestId('run-card').nth(1);
      const saved = page.waitForResponse((response) => response.url().includes('/api/domain/lesson-planner/stack') && response.request().method() === 'POST');
      await hook.getByRole('button', { name: /Fewer minutes for Hook/ }).click();
      await expect(hook.getByTestId('step-minutes')).toHaveText('14 min');
      await expect(page.getByTestId('time-status')).toHaveText('1 min to spare');
      expect((await saved).ok()).toBe(true);
      await page.reload();
      await expect(page.getByTestId('run-card').nth(1).getByTestId('step-minutes')).toHaveText('14 min');
    });

    test('over the period: two fixes, never on writing; Apply and Undo', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      const prisma = createE2EPrismaClient();
      try {
        await prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: { periodMinutes: 45 } });
      } finally {
        await prisma.$disconnect();
      }
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('time-status')).toHaveText('5 min over');
      const fixes = page.getByTestId('time-fix');
      await expect(fixes).toHaveCount(2);
      await expect(fixes.nth(0)).toContainText('Trim “Hook activity: What’s in your bag?” to 10 min');
      await expect(fixes.nth(1)).toContainText('to tomorrow');
      await expect(page.getByTestId('time-fixes')).toContainText('Fixes never cut writing time.');

      await fixes.nth(0).getByRole('button', { name: 'Apply' }).click();
      await expect(page.getByTestId('time-status')).toHaveText('Right on time');
      await expect(page.getByTestId('run-card').nth(1).getByTestId('step-minutes')).toHaveText('10 min');
      await page.getByTestId('stack-change').getByRole('button', { name: 'Undo' }).click();
      await expect(page.getByTestId('run-card').nth(1).getByTestId('step-minutes')).toHaveText('15 min');
    });

    test('a Context step moved to tomorrow waits at the top of the next lesson for the class', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      const prisma = createE2EPrismaClient();
      try {
        await prisma.lessonPlanConversation.update({ where: { id: conversationId }, data: { periodMinutes: 47 } });
      } finally {
        await prisma.$disconnect();
      }
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const tomorrow = page.getByTestId('time-fix').filter({ hasText: 'to tomorrow' });
      await expect(tomorrow).toContainText('Frame — The author');
      await tomorrow.getByRole('button', { name: 'Apply' }).click();
      await expect(page.getByTestId('run-card')).toHaveCount(7);
      await expect(page.getByTestId('time-status')).toHaveText('Right on time');

      const next = await seedConversation(e2eContext, [
        { role: 'user', content: 'Day two.' },
        { role: 'assistant', content: 'Here is day two.' },
      ], 'Day Two');
      await page.goto(`/app/lesson-planner/${next.conversationId}/packet`);
      const first = page.getByTestId('run-card').first();
      await expect(first.getByTestId('run-card-title')).toHaveText('Frame — The author');
      await expect(first.getByTestId('type-chip')).toContainText('Moved from');
    });

    test('add a piece where the teacher points; the next one lands after it', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      const prisma = createE2EPrismaClient();
      try {
        await prisma.lessonPlanMessage.create({
          data: { conversationId, role: 'assistant', content: SWAP_REPLY, createdAt: new Date(Date.UTC(2026, 9, 19, 11)) },
        });
      } finally {
        await prisma.$disconnect();
      }
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('run-card').nth(1).hover();
      await page.getByRole('button', { name: /Add a piece after Hook activity/ }).click();
      await expect(page.getByTestId('insert-placeholder')).toHaveText(/New piece goes here/);
      const panel = page.getByTestId('add-panel');
      await expect(panel.getByTestId('add-panel-where')).toHaveText('Goes in at minute 20, after “Hook activity: What’s in your bag?”');
      const card = panel.getByTestId('suggestion-card').filter({ hasText: 'The heaviest thing' });
      await expect(card.getByTestId('suggestion-impact')).toHaveText('+5 min · puts you 5 over · writing to 27%');
      await card.getByRole('button', { name: 'Add' }).click();
      await expect(page.getByTestId('run-card')).toHaveCount(9);
      await expect(page.getByTestId('run-card').nth(2).getByTestId('run-card-title')).toHaveText(
        'The heaviest thing you’ve carried'
      );
      await expect(page.getByTestId('time-status')).toHaveText('5 min over');
      // The insert point moved after the new piece.
      await expect(panel.getByTestId('add-panel-where')).toContainText('after “The heaviest thing you’ve carried”');
    });

    test('the stack chat changes the stack in one line, with Undo', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('open-ask').click();
      await page.getByTestId('stack-ask-input').fill('shorten the hook to 10 minutes');
      await page.getByRole('button', { name: 'Send' }).click();
      const panel = page.getByTestId('add-panel');
      await expect(panel.getByTestId('ask-reply').last()).toHaveText('Hook activity: What’s in your bag? set to 10 min.');
      await expect(page.getByTestId('run-card').nth(1).getByTestId('step-minutes')).toHaveText('10 min');
      await expect(page.getByTestId('time-status')).toHaveText('5 min to spare');
      await panel.getByTestId('ask-undo').click();
      await expect(page.getByTestId('run-card').nth(1).getByTestId('step-minutes')).toHaveText('15 min');

      // In the planner chat, the change is one compact line.
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await expect(page.getByTestId('stack-turn').first()).toContainText('shorten the hook to 10 minutes');
    });

    test('set the lesson, then keep editing', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('finish-line')).toContainText('Ready for');
      await page.getByTestId('set-lesson').click();
      const set = page.getByTestId('lesson-set');
      await expect(set).toContainText('Lesson set for');
      await expect(set.getByTestId('stat-planned')).toHaveText('50 min');
      await expect(set.getByTestId('stat-writing')).toHaveText('20%');
      await expect(page.getByTestId('stack-save-state')).toContainText('Lesson set · saved');
      await set.getByTestId('keep-editing').click();
      await expect(page.getByTestId('finish-line')).toBeVisible();
    });

    test('the deck is built from the stack, not a step in it', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId, assistantIds } = await seedDayOneStack(page, e2eContext);
      const prisma = createE2EPrismaClient();
      try {
        await prisma.lessonPlanMaterial.create({
          data: {
            conversationId,
            sourceMessageId: assistantIds[0]!,
            sourceCreatedAt: new Date(),
            blockKey: 'deck',
            slot: 'deck',
            kind: 'slides',
            title: 'Day One deck',
            audience: 'teacher',
            content: '```yawp-slides\n' + JSON.stringify({ title: 'Day One', slides: [{ layout: 'title', title: 'Day One', speakerNotes: 'Go.', minutes: 1 }] }) + '\n```',
          },
        });
      } finally {
        await prisma.$disconnect();
      }
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await expect(page.getByTestId('run-card')).toHaveCount(8);
      await expect(page.getByTestId('time-total')).toHaveText('50');
      await expect(page.getByTestId('take-to-class').getByTestId('deck-present')).toBeVisible();
    });
  });

  test.describe('Phase 3: what goes out of the room', () => {
    test('handouts for any step: students’ pieces in by default, a teacher step written for students', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      const prisma = createE2EPrismaClient();
      try {
        const hook = await prisma.lessonPlanMaterial.findFirstOrThrow({
          where: { conversationId, title: { startsWith: 'Hook activity' } },
        });
        const { studentVersionKey } = await import('../../app/domain/lesson-planner/step-handout');
        await prisma.lessonPlanMaterial.update({
          where: { id: hook.id },
          data: {
            studentVersion: 'Pick one object that tells a stranger something true about you.',
            studentVersionKey: studentVersionKey(hook.content),
          },
        });
      } finally {
        await prisma.$disconnect();
      }
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('handouts-print').click();
      await expect(page.getByTestId('step-handouts')).toBeVisible();
      const rows = page.getByTestId('handout-step');
      await expect(rows).toHaveCount(8);
      const starter = rows.filter({ hasText: 'Four minutes of writing' });
      await expect(starter.getByRole('checkbox')).toBeChecked();
      const hook = rows.filter({ hasText: 'Hook activity' });
      await expect(hook.getByRole('checkbox')).not.toBeChecked();
      await hook.getByRole('checkbox').check();
      await expect(hook.getByTestId('handout-step-status')).toHaveText('Written for students');

      const href = await hook.getByTestId('handout-step-alone').getAttribute('href');
      const response = await page.request.get(href!);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toBe('application/pdf');
      const all = await page.request.get(await page.getByTestId('handout-pdf').getAttribute('href') as string);
      expect(all.status()).toBe(200);
    });
  });

  test.describe('Phase 3: post and send', () => {
    async function seedDeck(conversationId: string, sourceMessageId: string) {
      const prisma = createE2EPrismaClient();
      try {
        await prisma.lessonPlanMaterial.create({
          data: {
            conversationId,
            sourceMessageId,
            sourceCreatedAt: new Date(),
            blockKey: 'deck',
            slot: 'deck',
            kind: 'slides',
            title: 'Day One deck',
            audience: 'teacher',
            content:
              '```yawp-slides\n' +
              JSON.stringify({
                title: 'Day One',
                slides: [{ layout: 'title', title: 'What we carry', speakerNotes: 'Let it sit for a beat.', minutes: 1 }],
              }) +
              '\n```',
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    }

    test('post to your class: one link to a student page with what was checked, no login', async ({
      page,
      signIn,
      e2eContext,
      browser,
    }) => {
      await stackV3On();
      await setLessonPlannerReviewFlag('lesson_planner_share', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId, assistantIds } = await seedDayOneStack(page, e2eContext);
      await seedDeck(conversationId, assistantIds[0]!);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const post = page.getByTestId('post-to-class');
      await expect(post).toContainText('Google Classroom opens in a new tab');
      await post.getByTestId('share-copy').click();
      const link = await post.getByTestId('share-link-text').textContent();
      expect(link).toMatch(/\/l\/[\w-]{40,}$/);

      const stranger = await browser.newContext();
      const visitor = await stranger.newPage();
      await visitor.goto(link!);
      await expect(visitor.getByTestId('shared-lesson')).toContainText('From your teacher');
      await expect(visitor.getByTestId('shared-slide')).toHaveCount(1);
      await expect(visitor.getByTestId('shared-slide')).not.toContainText('Let it sit');
      await expect(visitor.getByTestId('shared-prompt').first()).toContainText('nobody else can see');
      await expect(visitor.getByTestId('shared-handout').first()).toBeVisible();
      await expect(visitor.locator('main')).not.toContainText('Give students 2 minutes');
      await stranger.close();
    });

    test('send a sub plan: the note comes first, and the link works without a login', async ({
      page,
      signIn,
      e2eContext,
      browser,
    }) => {
      await stackV3On();
      await setLessonPlannerReviewFlag('lesson_planner_share', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId, assistantIds } = await seedDayOneStack(page, e2eContext);
      await seedDeck(conversationId, assistantIds[0]!);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const send = page.getByTestId('send-lesson');
      await expect(send.getByRole('button', { name: 'Send sub plan' })).toBeVisible();
      await send.getByRole('tab', { name: 'Family' }).click();
      await expect(send.getByRole('button', { name: 'Send to family' })).toBeVisible();
      await send.getByRole('tab', { name: 'Substitute' }).click();
      await send.getByTestId('send-recipient').fill('sub@school.org');
      await send.getByLabel('Special instructions for your sub').fill('Fire drill at 10:15. Leave by the east door.');
      await send.getByTestId('send-button').click();
      await expect(send.getByTestId('send-done')).toContainText('Sent to sub@school.org');
      const link = await send.getByTestId('send-link').getAttribute('href');

      const stranger = await browser.newContext();
      const visitor = await stranger.newPage();
      await visitor.goto(link!);
      await expect(visitor.getByTestId('shared-note')).toContainText('Fire drill at 10:15');
      await expect(visitor.getByTestId('shared-body')).toContainText('Hook activity');
      // A sub runs the slides, so a sub sees what to say.
      await expect(visitor.getByTestId('shared-slide')).toContainText('Let it sit');
      await stranger.close();
    });

    test('a made-up link opens nothing', async ({ browser }) => {
      const stranger = await browser.newContext();
      const visitor = await stranger.newPage();
      const response = await visitor.goto('/l/abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG');
      expect(response?.status()).toBe(404);
      await stranger.close();
    });
  });

  test.describe('Phase 4: Run the show', () => {
    test('step by step, with the clock off by default; Next to the end', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await setLessonPlannerReviewFlag('lesson_planner_run_show', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('set-lesson').click();
      await page.getByTestId('run-the-show').click();
      await expect(page).toHaveURL(new RegExp(`/show/${conversationId}`));

      const now = page.getByTestId('show-now');
      await expect(now).toContainText('Now · Step 1 of 8');
      await expect(page.getByTestId('show-clock')).toHaveText('Planned: 5 min');
      await page.getByTestId('show-next').click();
      await expect(page.getByTestId('show-title')).toHaveText('Hook activity: What’s in your bag?');
      await expect(page.getByTestId('show-rail-step').first()).toHaveAttribute('data-state', 'done');
      await page.getByTestId('show-rail-step').last().click();
      await expect(page.getByTestId('show-title')).toHaveText('Closing');
      await page.getByTestId('show-next').click();
      await expect(page.getByTestId('show-done')).toContainText('That’s the show.');
      await page.getByTestId('run-again').click();
      await expect(now).toContainText('Now · Step 1 of 8');
    });

    test('countdown: time left, then calm overtime, never red', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await setLessonPlannerReviewFlag('lesson_planner_run_show', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.clock.install();
      await page.goto(`/show/${conversationId}`);
      await page.getByTestId('clock-countdown').click();
      await expect(page.getByTestId('show-clock')).toContainText('5:00 left');
      await page.clock.fastForward('03:30');
      await expect(page.getByTestId('show-heads-up')).toHaveText('Two minutes left in this step.');
      await page.clock.fastForward('02:30');
      const over = page.getByTestId('show-overtime');
      await expect(over).toContainText('past the plan. No rush.');
      await expect(over).toHaveClass(/amber/);
      await expect(over).not.toHaveClass(/red|animate/);
    });

    test('the projector follows the teacher', async ({ page, signIn, e2eContext, context }) => {
      await stackV3On();
      await setLessonPlannerReviewFlag('lesson_planner_run_show', true);
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId, assistantIds } = await seedDayOneStack(page, e2eContext);
      const prisma = createE2EPrismaClient();
      let deckId: string;
      try {
        deckId = (
          await prisma.lessonPlanMaterial.create({
            data: {
              conversationId,
              sourceMessageId: assistantIds[0]!,
              sourceCreatedAt: new Date(),
              blockKey: 'deck',
              slot: 'deck',
              kind: 'slides',
              title: 'Day One deck',
              audience: 'teacher',
              content:
                '```yawp-slides\n' +
                JSON.stringify({
                  title: 'Day One',
                  slides: [
                    { layout: 'title', title: 'What we carry', speakerNotes: 'Go.', minutes: 1 },
                    { layout: 'prompt', title: 'Write', body: 'What do you carry?', speakerNotes: 'Go.', minutes: 5, step: 1 },
                    { layout: 'statement', title: 'What’s in your bag?', body: 'Pick one object.', speakerNotes: 'Go.', minutes: 15, step: 2 },
                  ],
                }) +
                '\n```',
            },
            select: { id: true },
          })
        ).id;
      } finally {
        await prisma.$disconnect();
      }
      const projector = await context.newPage();
      await projector.goto(`/present/${conversationId}/${deckId}`);
      await expect(projector.getByTestId('slide-counter')).toHaveText('1 / 3');

      await page.goto(`/show/${conversationId}`);
      await expect(page.getByTestId('projector-following')).toBeVisible();
      await expect(projector.getByTestId('slide-counter')).toHaveText('2 / 3');
      await page.getByTestId('show-next').click();
      await expect(projector.getByTestId('slide-counter')).toHaveText('3 / 3');
      await expect(page.getByTestId('show-now')).toContainText('On the projector now · slide 3');
    });
  });

  test.describe('Phase 5: templates', () => {
    test('save a set lesson’s shape, then start a new lesson from it', async ({ page, signIn, e2eContext }) => {
      await stackV3On();
      await setLessonPlannerReviewFlag('lesson_planner_templates', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      await page.getByTestId('set-lesson').click();
      await page.getByTestId('save-template').click();
      await page.getByTestId('template-name').fill('Read & write day');
      // The ✓ shows at once; leaving before the save lands would cancel it.
      const saved = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/stack') &&
          response.request().method() === 'POST' &&
          (response.request().postData() ?? '').includes('save-template')
      );
      await page.getByRole('button', { name: 'Save', exact: true }).click();
      expect((await saved).ok()).toBe(true);
      await expect(page.getByTestId('save-template')).toHaveText('Saved as a template ✓');

      await page.goto('/app/lesson-planner');
      const tiles = page.getByTestId('prompt-tiles').locator('li');
      await expect(tiles.nth(1)).toContainText('Build from my templates');
      // The tile only opens the list once the page has hydrated; CI is slow
      // enough for a first click to land before that.
      const row = page.getByTestId('template-row').filter({ hasText: 'Read & write day' });
      const tile = page.getByTestId('template-tile');
      await expect(async () => {
        // It toggles: click only while it is not open.
        if ((await tile.getAttribute('aria-pressed')) !== 'true') await tile.click();
        await expect(row).toBeVisible({ timeout: 1_000 });
      }).toPass({ timeout: 15_000 });
      await expect(row).toContainText('Class Starter → Activity → Context → Read aloud → Daily Pages → Closing · 50 min');
      await expect(row).toContainText('20% writing');
      await row.click();
      await expect(page.getByTestId('template-chip')).toHaveText(/Using your template: Read & write day/);
      await expect(page.getByLabel('Message the Lesson Planner')).toHaveAttribute('placeholder', /What are we reading\?/);

      const sent: string[] = [];
      await page.route('**/api/domain/lesson-planner', (route) => {
        sent.push(route.request().postData() ?? '');
        return route.abort();
      });
      await page.getByLabel('Message the Lesson Planner').fill('Chapter 2 of The Things They Carried');
      await page.getByRole('button', { name: 'Send message' }).click();
      await expect.poll(() => sent.join('\n')).toContain('templateId=');
    });
  });

  test.describe('The gallery deck (Lesson Deck Kit)', () => {
    const notes = { speakerNotes: 'Say it.' };
    const GALLERY_DECK = {
      title: 'The weight of things',
      unit: 'The Things They Carried',
      accent: 'ember',
      art: 'turner-temeraire',
      slides: [
        { layout: 'title', title: 'The weight of things', subtitle: 'Day one', ...notes },
        { layout: 'agenda', title: 'Today', agenda: [{ title: 'Daily Pages', minutes: 5 }, { title: 'What’s in your bag?', minutes: 15 }], ...notes },
        { layout: 'write', title: 'Write', body: 'Name one thing you carry that nobody can see.', seconds: 300, ...notes },
        { layout: 'look', title: 'Look', question: 'What is being carried away here?', ...notes },
        { layout: 'exit', title: 'Before you go', body: 'One object, one sentence: why it matters.', nextLesson: 'Love', ...notes },
      ],
    };
    const GALLERY_REPLY = `Here is the deck.\n\n\`\`\`yawp-slides\n${JSON.stringify(GALLERY_DECK, null, 2)}\n\`\`\``;

    test('flag on: Present hangs the kit look, with mode words, the art and its credit', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      await setLessonPlannerReviewFlag('lesson_planner_deck_gallery', true);
      const { conversationId, assistantIds } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: GALLERY_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/present/${conversationId}/${assistantIds[0]}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage.locator('[data-theme="gallery"]')).toBeVisible();
      await expect(stage.getByTestId('gallery-credit')).toContainText('The Fighting Temeraire');
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('ArrowRight');
      await expect(stage.getByTestId('gallery-mode')).toHaveText('Today.');
      await expect(stage).toContainText('THE THINGS THEY CARRIED', { ignoreCase: true });
      await page.keyboard.press('ArrowRight');
      await expect(stage.locator('[data-ground="pine"]')).toBeVisible();
      await expect(stage.getByTestId('gallery-mode')).toHaveText('Write.');
      await page.keyboard.press('ArrowRight');
      // Never two dark slides in a row: the look slide after writing is on paper.
      await expect(stage.locator('[data-template="look"]')).toHaveAttribute('data-ground', 'paper');
      await page.keyboard.press('ArrowRight');
      await expect(stage.locator('[data-ground="accent"]')).toBeVisible();
      await expect(stage.getByTestId('gallery-mode')).toHaveText('Before you go.');

      const response = await page.request.get(`/present/${conversationId}/${assistantIds[0]}.pptx`);
      expect(response.ok()).toBe(true);
      expect((await response.body()).byteLength).toBeGreaterThan(50_000); // the painting is in it
    });

    test('flag off: the same deck draws on the tile template', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_deck_v2', true);
      const { conversationId, assistantIds } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Build the slide deck for this lesson' },
        { role: 'assistant', content: GALLERY_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/present/${conversationId}/${assistantIds[0]}`);
      const stage = page.getByTestId('slide-stage');
      await expect(stage.locator('[data-theme="tile"]')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await page.keyboard.press('ArrowRight');
      // The agenda reads as a notes slide, with its minutes.
      await expect(stage).toContainText('What’s in your bag? (15 min)');
    });
  });

  test.describe("Kevin's notes on the latest run", () => {
    const LECTURE_REPLY = [
      '# The war at home',
      '',
      '## Class starter (5 min)',
      '',
      'Students write as they come in.',
      '',
      '```yawp-daily-pages',
      'kind: class-starter',
      'What is one thing you carry that nobody else can see?',
      '```',
      '',
      '## Mini-lecture: the draft (12 min)',
      '',
      'Walk through the notes, stopping for questions.',
      '',
      '```yawp-material',
      'kind: notes',
      'title: Lecture notes: the draft',
      '---',
      'The draft lottery began in 1969.',
      '```',
      '',
      '## Closing (3 min)',
      '',
      'One sentence on the way out.',
    ].join('\n');
    const OPTIONS_REPLY = [
      'Pick one:',
      '',
      '```yawp-daily-pages\nkind: class-starter\nThink of the last time you tried to convince someone.\n```',
      '',
      '```yawp-daily-pages\nkind: class-starter\nWrite about a rule you think is wrong.\n```',
      '',
      '```yawp-daily-pages\nkind: class-starter\nDescribe something you believed last year.\n```',
    ].join('\n');

    test('a plan’s steps read as numbered sections with their time; no sparkle on Create', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await stackV3On();
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan it' },
        { role: 'assistant', content: LECTURE_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const lecture = page.getByTestId('plan-segment').filter({ hasText: 'Mini-lecture' });
      await expect(lecture.getByTestId('plan-step-title')).toHaveText('Mini-lecture: the draft');
      await expect(lecture.getByTestId('plan-step-minutes')).toHaveText('12 min');
      await expect(lecture.getByRole('heading', { level: 2 })).toBeVisible();
      await expect(page.getByTestId('daily-pages-create').locator('svg')).toHaveCount(0);
    });

    test('options sit side by side, paged with arrows, each with its own buttons', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Three warm-ups' },
        { role: 'assistant', content: OPTIONS_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      const row = page.getByTestId('option-row');
      await expect(row).toHaveCount(1);
      await expect(row).toContainText('Class starter options');
      await expect(row.getByTestId('daily-pages-card')).toHaveCount(3);
      await expect(row.getByTestId('daily-pages-create')).toHaveCount(3);
      await expect(row.getByTestId('option-row-position')).toHaveText('1 of 3');
      await expect(row.getByTestId('option-prev')).toBeDisabled();
      // One row, not three cards stacked: the cards share a top edge.
      const tops = await row.getByTestId('daily-pages-card').evaluateAll((cards) =>
        cards.map((card) => Math.round(card.getBoundingClientRect().top))
      );
      expect(new Set(tops).size).toBe(1);
      await page.waitForLoadState('networkidle');
      await row.getByTestId('option-next').click();
      await expect(row.getByTestId('option-row-position')).toHaveText('2 of 3');
    });

    test('cards added out of order land in the reply’s order, with their step’s time', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await stackV3On();
      const { conversationId } = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan it' },
        { role: 'assistant', content: LECTURE_REPLY },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${conversationId}`);
      await page.waitForLoadState('networkidle');
      // Kevin's order: the lecture notes first, then the class starter.
      const filed = () =>
        page.waitForResponse((response) => response.url().includes('/api/domain/lesson-planner/packet') && response.request().method() === 'POST');
      const notesAdded = filed();
      await page
        .getByTestId('material-card')
        .filter({ hasText: 'Lecture notes' })
        .getByRole('button', { name: /Add to stack/ })
        .click();
      await notesAdded;
      const starterAdded = filed();
      await page.getByTestId('daily-pages-card').getByRole('button', { name: /Add to stack/ }).click();
      await starterAdded;

      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const cards = page.getByTestId('run-card');
      await expect(cards).toHaveCount(2);
      await expect(cards.nth(0)).toContainText('Class Starter');
      await expect(cards.nth(0).getByTestId('run-card-start')).toHaveText('Start');
      await expect(cards.nth(0)).toContainText('5 min');
      await expect(cards.nth(1)).toContainText('Lecture notes');
      await expect(cards.nth(1)).toContainText('12 min');
      await expect(cards.nth(1).getByTestId('run-card-start')).toHaveText('05');
    });

    test('the stack page scrolls with the wheel when it runs past the screen', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await stackV3On();
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.setViewportSize({ width: 1280, height: 600 });
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const stack = page.getByTestId('stack-v3');
      await expect(stack).toBeVisible();
      await page.mouse.move(500, 400);
      await page.mouse.wheel(0, 1500);
      await expect.poll(() => stack.evaluate((element) => element.scrollTop)).toBeGreaterThan(100);
    });
  });

  test.describe('the how-it-works guide follows the planner', () => {
    test('with the review flags on, it shows the run of show, sharing, Run the show, templates and the gallery deck', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      for (const flag of REVIEW_FLAGS) await setLessonPlannerReviewFlag(flag, true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto('/app/lesson-planner/how-it-works');
      await expect(page.getByRole('heading', { name: 'Your lesson, start to finish' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Run the show' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Reuse a shape that works' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Post it, or send it' })).toBeVisible();
      for (const clip of ['plan-steps', 'run-of-show', 'run-the-show', 'templates', 'gallery-deck']) {
        await expect(page.locator(`video[poster$="/${clip}.jpg"]`)).toHaveCount(1);
      }
      await expect(page.getByTestId('guide-wont')).toContainText('only when you post or send it');
      // Every clip and still the guide points at is really there.
      const sources = await page.locator('video source, img[src*="lesson-planner-guide"], video[poster]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('src') ?? node.getAttribute('poster')!)
      );
      for (const source of sources) expect((await page.request.get(source)).ok(), source).toBe(true);

      // The new sections stay in bounds on a phone too.
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto('/app/lesson-planner/how-it-works');
      await expect(page.getByRole('heading', { name: 'Run the show' })).toBeAttached();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test('with them off, it is the guide teachers have today', async ({ page, signIn, e2eContext }) => {
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto('/app/lesson-planner/how-it-works');
      await expect(page.getByRole('heading', { name: 'Everything for the lesson, in one place to print' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Run the show' })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: 'Reuse a shape that works' })).toHaveCount(0);
      await expect(page.locator('video[poster$="/plan.jpg"]')).toHaveCount(1);
      await expect(page.locator('video[poster$="/deck.jpg"]')).toHaveCount(1);
      await expect(page.getByTestId('guide-wont')).toContainText('They stay in your account');
    });
  });
});
