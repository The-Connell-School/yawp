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
];

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
});
