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
];

async function stackV3On() {
  await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
  await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
}

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

/** Brian's day one lesson, as the planner returned it on run 3. */
export const DAY_ONE_REPLY = [
  '# Day One: The Things They Carried — What We Carry',
  '',
  '## Class starter (5 min)',
  '',
  '```yawp-daily-pages',
  'kind: class-starter',
  'title: Four minutes of writing, then a share',
  'What is one thing you carry every day that nobody else can see?',
  '```',
  '',
  '## Hook activity: What’s in your bag? (15 min)',
  '',
  'Give students 2 minutes to lay out what is in their bag or pockets, or list it from memory. Then they pick one object that would tell a stranger something true about them. Pairs share, then pull 4–5 objects to the whole class. Land on: the things people carry are never just things.',
  '',
  '## Framing (10 min)',
  '',
  '```yawp-material',
  'kind: notes',
  'title: Frame — Historical context',
  'minutes: 4',
  'type: context',
  '---',
  'The Vietnam War, 1965–1973, and who was drafted.',
  '```',
  '',
  '```yawp-material',
  'kind: notes',
  'title: Frame — The author',
  'minutes: 3',
  'type: context',
  '---',
  'Tim O’Brien was drafted in 1968.',
  '```',
  '',
  '```yawp-material',
  'kind: notes',
  'title: Frame — Literary context',
  'minutes: 3',
  'type: context',
  '---',
  'A story about stories: fiction that knows it is fiction.',
  '```',
  '',
  '## Read aloud: the opening of the title story (12 min)',
  '',
  'If you like reading aloud yourself, take the first pages. Stop at the first list.',
  '',
  '## Daily Pages (5 min)',
  '',
  '```yawp-daily-pages',
  'kind: daily-pages',
  'O’Brien lists what every soldier carries — down to the ounce. What would your list say about you?',
  '```',
  '',
  '## Closing (3 min)',
  '',
  'Exit ticket: one object, one sentence about why it matters.',
  '',
  'Total: 5 + 15 + 4 + 3 + 3 + 12 + 5 + 3 = 50 minutes',
  '',
  'You don’t have to use all of these. Pick one framing card or all three.',
  '',
  'Want to refine or edit any part of this?',
].join('\n');

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

    test('the closing exit ticket can be created in YAWP!, then says so', async ({ page, signIn, e2eContext }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      const { conversationId } = await seedDayOneStack(page, e2eContext);
      await page.goto(`/app/lesson-planner/${conversationId}/packet`);
      const closing = page.getByTestId('packet-section').filter({ hasText: 'one object, one sentence' });
      const create = closing.getByTestId('stack-create-assignment');
      await expect(create).toHaveText('Create this exit ticket in YAWP!');
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
      ).toHaveText('Created in YAWP! · Open');
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
});
