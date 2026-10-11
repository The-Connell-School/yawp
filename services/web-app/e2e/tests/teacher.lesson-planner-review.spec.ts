/**
 * Lesson Planner changes from Brian's review session
 * (docs/plans/2026-10-11-lesson-planner-brian-review.md).
 *
 * Every reply here is seeded: the model is never called. Each change sits
 * behind its own flag, so most tests turn their flag on and the afterEach
 * turns every review flag back off.
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
];

type Ctx = { teacherMembershipId: string; organizationId: string };
type Turn = { role: 'user' | 'assistant'; content: string };

async function seedConversation(e2eContext: Ctx, turns: Turn[], title = 'Review lesson') {
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title,
        messages: {
          create: turns.map((turn, index) => ({
            ...turn,
            createdAt: new Date(Date.UTC(2026, 9, 11, 10, 0, index)),
          })),
        },
      },
      select: { id: true },
    });
    return conversation.id;
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

const PLAN =
  '# The Things They Carried — Day 1\n\n## Objective\n\nEnter the book through weight and burden.\n\n' +
  '## Class starter (8 min)\n\nWrite about something you carry.\n\n' +
  '## Reading (40 min)\n\nRead the first story together.';

const INTAKE_QUESTION = 'Which class is this for, and how long is the period?';

test.describe("Lesson Planner — Brian's review", () => {
  test.afterEach(async ({ e2eContext }) => {
    await clearLessonPlans(e2eContext.teacherMembershipId);
    for (const flag of REVIEW_FLAGS) {
      await setLessonPlannerReviewFlag(flag, false);
    }
  });

  test.describe('whole-reply stack controls (B4)', () => {
    test('flag off: every reply keeps the original two buttons', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan a lesson on The Things They Carried.' },
        { role: 'assistant', content: INTAKE_QUESTION },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      await expect(page.getByRole('button', { name: 'Add all of this' })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add all as a handout' })
      ).toBeVisible();
    });

    test('flag on: an intake question offers nothing to stack', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan a lesson on The Things They Carried.' },
        { role: 'assistant', content: INTAKE_QUESTION },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      await expect(page.getByText(INTAKE_QUESTION)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Add all of this' })).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /add the whole lesson/i })
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Add all as a handout' })
      ).toHaveCount(0);
    });

    test('flag on: a plan invites a stack and keeps the next-step chips', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan day one of The Things They Carried.' },
        { role: 'assistant', content: PLAN },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      await expect(page.getByTestId('plan-stack-invite')).toContainText(
        "You don't have to use all of these"
      );
      await expect(
        page.getByRole('button', { name: 'Add the whole lesson to the stack' })
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Add all as a handout' })
      ).toHaveCount(0);
      // The chips stay where they are.
      await expect(
        page.getByRole('button', { name: /build the slide deck/i })
      ).toBeVisible();

      await page.getByRole('button', { name: 'Add the whole lesson to the stack' }).click();
      await expect(page.getByText('In the stack', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'Remove from stack' }).click();
      await expect(
        page.getByRole('button', { name: 'Add the whole lesson to the stack' })
      ).toBeVisible();
    });
  });

  test.describe('the stack is the lesson (B1, B2, B5)', () => {
    const STARTERS =
      '## Class starter (8 min)\n\nPick one:\n\n' +
      '```yawp-daily-pages\nkind: class-starter\nWrite about something you carry every day.\n```\n\n' +
      '```yawp-daily-pages\nkind: class-starter\nWhat is the heaviest thing you have ever carried?\n```\n\n' +
      '## Reading (40 min)\n\nRead the first story together.';

    test('flag off: a class starter has no stack button', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      const id = await seedConversation(e2eContext, [
        { role: 'user', content: 'Plan day one of The Things They Carried.' },
        { role: 'assistant', content: STARTERS },
      ]);
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);
      await expect(page.getByTestId('daily-pages-card')).toHaveCount(2);
      await expect(page.getByTestId('daily-pages-stack-toggle')).toHaveCount(0);
    });

    test('flag on: stack one starter, then remove it from the stack screen with Undo', async ({
      page,
      signIn,
      e2eContext,
    }) => {
      await setLessonPlannerReviewFlag('lesson_planner_stack_v2', true);
      const id = await seedConversation(
        e2eContext,
        [
          {
            role: 'user',
            content:
              "I'm teaching 'the things they carried' for the first time and I don't really know how to begin.",
          },
          { role: 'assistant', content: STARTERS },
        ],
        "I'm teaching 'the things they carried' for the first time…"
      );
      await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
      await page.goto(`/app/lesson-planner?c=${id}`);

      const toggles = page.getByTestId('daily-pages-stack-toggle');
      await expect(toggles).toHaveCount(2);
      const filed = page.waitForResponse(
        (response) =>
          response.url().includes('/api/domain/lesson-planner/packet') &&
          response.request().method() === 'POST'
      );
      await toggles.nth(1).click();
      expect((await filed).ok()).toBe(true);
      await expect(toggles.nth(1)).toHaveText(/in the stack/i);
      await expect(toggles.nth(1)).toHaveAttribute('title', 'Click to remove from stack');
      await expect(toggles.nth(0)).toHaveText(/add to stack/i);

      await page.goto(`/app/lesson-planner/${id}/packet`);
      // B5: the raw first message is not presented as the lesson's name.
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Untitled lesson');
      await expect(page.getByLabel('Lesson name')).toHaveAttribute(
        'placeholder',
        'Name this lesson'
      );
      await expect(page.getByText("We'll name it from your plan, or type one.")).toBeVisible();

      const sections = page.getByTestId('packet-section');
      await expect(sections).toHaveCount(1);
      await expect(sections.first()).toContainText('heaviest thing');

      // Remove, then Undo.
      await page.getByTestId('section-remove').click();
      await expect(sections).toHaveCount(0);
      await page.getByTestId('remove-undo').getByRole('button', { name: 'Undo' }).click();
      await expect(sections).toHaveCount(1);

      // Remove for real: it is gone after a reload.
      await page.getByTestId('section-remove').click();
      await expect(page.getByTestId('remove-undo')).toBeHidden({ timeout: 10_000 });
      await page.reload();
      await expect(page.getByTestId('packet-section')).toHaveCount(0);

      // And the chat agrees.
      await page.goto(`/app/lesson-planner?c=${id}`);
      await expect(page.getByTestId('daily-pages-stack-toggle').nth(1)).toHaveText(
        /add to stack/i
      );
    });
  });

  test('"In the stack" says what clicking it does (B3)', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const id = await seedConversation(e2eContext, [
      { role: 'user', content: 'Plan a lesson on weathering and erosion.' },
      {
        role: 'assistant',
        content:
          '## Closing (4 min)\n\nThe last four minutes.\n\n' +
          '```yawp-exit-ticket\n' +
          'kind: check\n' +
          'focus: explain-concept\n' +
          'topic: the difference between weathering and erosion\n' +
          'answer: objective\n' +
          'mustMention: Whether the material moves.\n' +
          '```',
      },
    ]);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${id}`);

    const toggle = page.getByTestId('exit-ticket-stack-toggle');
    await toggle.click();
    await expect(toggle).toHaveText(/in the stack/i);
    await expect(toggle).toHaveAttribute('title', 'Click to remove from stack');
  });
});
