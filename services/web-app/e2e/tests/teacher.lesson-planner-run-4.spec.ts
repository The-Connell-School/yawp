/**
 * Lesson Planner changes from Brian's fourth run
 * (docs/plans/2026-10-22-lesson-planner-brian-run-4.md).
 *
 * Every reply is seeded: the model is never called. Each test turns on the
 * flags it needs and the afterEach turns every flag back off.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';
import { DAY_ONE_REPLY } from '../fixtures/lesson-planner/day-one-reply';

const TEACHER_PASSWORD = 'teacher-e2e-password';

const FLAGS: LessonPlannerReviewFlag[] = [
  'lesson_planner_stack_v2',
  'lesson_planner_stack_v3',
  'lesson_planner_share',
  'lesson_planner_run_show',
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[]) {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Catcher, ch. 1–4',
        periodMinutes: 50,
        lessonClassLabel: 'English 11 · Period 2',
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 9, 22, 10, 0, index)),
          })),
        },
      },
      select: {
        id: true,
        messages: { where: { role: 'assistant' }, orderBy: { createdAt: 'asc' }, select: { id: true } },
      },
    });
    return { conversationId: conversation.id, assistantIds: conversation.messages.map((message) => message.id) };
  } finally {
    await prisma.$disconnect();
  }
}

async function seedDayOneStack(page: import('@playwright/test').Page, e2eContext: Ctx) {
  const seeded = await seedConversation(e2eContext, [
    { role: 'user', content: 'Day one of The Things They Carried, English 10, 50 minutes.' },
    { role: 'assistant', content: DAY_ONE_REPLY },
  ]);
  const response = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId: seeded.conversationId, messageId: seeded.assistantIds[0]! },
  });
  expect(response.ok()).toBe(true);
  return seeded;
}

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

test.describe("Lesson Planner — Brian's fourth run", () => {
  test.afterEach(async ({ e2eContext }) => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.lessonPlanConversation.deleteMany({ where: { membershipId: e2eContext.teacherMembershipId } });
    } finally {
      await prisma.$disconnect();
    }
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('item 2: the exit ticket picked from the Closing carries the Closing’s minutes into the run of show', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
    const ticket = (body: string) => '```yawp-exit-ticket\n' + body + '\n```';
    const reply = [
      '# Catcher, chapters 1–4',
      '## Discussion: Holden’s voice (20 min)',
      'Pairs find two lines where Holden says one thing and means another.',
      '## Closing (5 min) {type: closing}',
      'Bring it back to the hat. Then one ticket, whichever fits:',
      ticket('mode: basic'),
      ticket('mode: basic'),
      ticket('mode: basic'),
    ].join('\n\n');
    const { conversationId } = await seedConversation(e2eContext, [
      { role: 'user', content: 'Catcher in the Rye, chapters 1–4, English 11, 50 minutes.' },
      { role: 'assistant', content: reply },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);
    await expect(page.getByTestId('plan-segment').filter({ hasText: 'Closing' }).getByTestId('segment-toggle')).toHaveCount(0);
    const save = page.waitForResponse((response) => response.url().includes('/api/domain/lesson-planner/packet') && response.request().method() === 'POST');
    await page.getByTestId('exit-ticket-stack-toggle').nth(1).click();
    expect((await save).ok()).toBe(true);

    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    // One card, the ticket, as the Closing: 5 minutes, never a second card for the step.
    const cards = page.getByTestId('run-card');
    await expect(cards).toHaveCount(1);
    await expect(cards.first().getByTestId('step-minutes')).toHaveText('5 min');
    await expect(cards.first()).toContainText('Closing');
  });

  test('item 3: a step dragged by its handle moves, one place down included', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedDayOneStack(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const titles = page.getByTestId('run-card').getByTestId('run-card-title');
    const first = (await titles.nth(0).textContent())!;
    const second = (await titles.nth(1).textContent())!;

    const cards = page.getByTestId('run-card');
    const box = (await cards.nth(1).boundingBox())!;
    await cards.nth(0).dragTo(cards.nth(1), { targetPosition: { x: box.width / 2, y: box.height * 0.75 } });
    await expect(titles.nth(0)).toHaveText(second);
    await expect(titles.nth(1)).toHaveText(first);

    // It stays where it was put.
    await page.reload();
    await expect(titles.nth(0)).toHaveText(second);
  });

  test('item 4: a Yawp! assignment opened from the stack goes back to the stack', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedDayOneStack(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const starter = page.getByTestId('run-card').first();
    await starter.getByRole('button', { expanded: false }).first().click();
    const create = starter.getByTestId('stack-create-assignment');
    await expect(create).toHaveAttribute('href', /back=stack/);
    await create.click();
    // The sheet opens with the prompt; once it closes (created or not), the
    // way back is the stack.
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('back-to-lesson')).toHaveAttribute('href', `/app/lesson-planner/${conversationId}/packet`);
    await page.getByTestId('back-to-lesson').click();
    await expect(page).toHaveURL(new RegExp(`/app/lesson-planner/${conversationId}/packet`));
  });

  test('a laptop screen on the projector: the class view hides notes and the clock', async ({ page, signIn, e2eContext }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
    await setLessonPlannerReviewFlag('lesson_planner_run_show', true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedDayOneStack(page, e2eContext);
    await page.goto(`/show/${conversationId}`);
    await expect(page.getByTestId('show-notes')).toBeVisible();
    await page.getByTestId('room-view').click();
    await expect(page.getByTestId('show-notes')).toHaveCount(0);
    await expect(page.getByTestId('show-clock')).toBeHidden();
    await expect(page.getByTestId('show-title')).toBeVisible();
    // Remembered on this device.
    await page.reload();
    await expect(page.getByTestId('show-notes')).toHaveCount(0);
    await page.getByTestId('room-view').click();
    await expect(page.getByTestId('show-notes')).toBeVisible();
  });

  test('item 5 and slides by audience: an admin can get the slides, without notes; a preview says no email went out', async ({
    page,
    signIn,
    e2eContext,
    browser,
  }) => {
    await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
    await setLessonPlannerReviewFlag('lesson_planner_stack_v3', true);
    await setLessonPlannerReviewFlag('lesson_planner_share', true);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId, assistantIds } = await seedDayOneStack(page, e2eContext);
    await seedDeck(conversationId, assistantIds[0]!);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);
    const send = page.getByTestId('send-lesson');
    await send.getByRole('tab', { name: 'Admin' }).click();
    const slides = send.getByRole('checkbox', { name: /^Slides/ });
    await expect(slides).not.toBeChecked();
    await slides.check();
    await send.getByTestId('send-recipient').fill('principal@school.org');
    await send.getByTestId('send-button').click();
    await expect(send.getByTestId('send-done')).toContainText('No email went out from this preview');
    const link = await send.getByTestId('send-link').getAttribute('href');

    const stranger = await browser.newContext();
    const visitor = await stranger.newPage();
    await visitor.goto(link!);
    await expect(visitor.getByTestId('shared-slide')).toHaveCount(1);
    await expect(visitor.getByTestId('shared-slide-notes')).toHaveCount(0);
    // One writing number, from the stack.
    await expect(visitor.locator('main')).toContainText('% of class is writing');
    await stranger.close();
  });
});
