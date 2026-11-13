/**
 * The teacher's say on the assignment type (Kevin, Nov 6): the stack's
 * Create button goes to the planner's guess in one click, and a chevron
 * beside it lists the other writing types the school has, each the same
 * prompt in that type.
 */
import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setLessonPlannerReviewFlag, type LessonPlannerReviewFlag } from '../feature-flags';

const TEACHER_PASSWORD = 'teacher-e2e-password';
const FLAGS: LessonPlannerReviewFlag[] = ['lesson_planner_stack_v2', 'lesson_planner_stack_v3'];

const REPLY = [
  '# Pre-Writing',
  '',
  '## Look closely (8 min) {type: activity}',
  '',
  'Project the photograph. What’s happening in this picture?',
  '',
  '## Pre-write (15 min) {type: activity}',
  '',
  'Pre-write: what do you already think about the prompt? Students pre-write for 15 minutes.',
].join('\n');

type Ctx = { teacherMembershipId: string; organizationId: string };

async function seedLesson(page: import('@playwright/test').Page, e2eContext: Ctx) {
  const prisma = createE2EPrismaClient();
  let ids: { conversationId: string; messageId: string };
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Pre-Writing',
        periodMinutes: 50,
        messages: {
          create: [
            { role: 'user', content: 'Pre-writing, 50 minutes.', createdAt: new Date(Date.UTC(2026, 10, 6, 10, 0, 0)) },
            { role: 'assistant', content: REPLY, createdAt: new Date(Date.UTC(2026, 10, 6, 10, 0, 1)) },
          ],
        },
      },
      select: { id: true, messages: { where: { role: 'assistant' }, select: { id: true } } },
    });
    ids = { conversationId: conversation.id, messageId: conversation.messages[0]!.id };
  } finally {
    await prisma.$disconnect();
  }
  const kept = await page.request.post('/api/domain/lesson-planner/packet', {
    form: { intent: 'keep-all', conversationId: ids.conversationId, messageId: ids.messageId },
  });
  expect(kept.ok()).toBe(true);
  return ids;
}

test.describe.serial('the teacher chooses the assignment type on Create', () => {
  test.beforeAll(async () => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, true);
  });
  test.afterAll(async () => {
    for (const flag of FLAGS) await setLessonPlannerReviewFlag(flag, false);
  });

  test('the guess is one click; the chevron lists the other types with the same prompt', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    const { conversationId } = await seedLesson(page, e2eContext);
    await page.goto(`/app/lesson-planner/${conversationId}/packet`);

    const card = page.getByTestId('run-card').filter({ hasText: 'Pre-write' });
    await expect(card.getByTestId('writing-badge')).toBeVisible();
    const create = card.getByTestId('not-in-yawp');
    // The e2e school has Class Starter and Daily Pages, no Pre-Writing: the
    // guess is Class Starter, and Daily Pages is the alternative.
    await expect(create).toHaveAttribute('href', new RegExp(`^/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}\\?`));
    // The lecture step has no Create and no chooser.
    await expect(page.getByTestId('run-card').filter({ hasText: 'Look closely' }).getByTestId('create-as-other-type')).toHaveCount(0);

    await card.getByTestId('create-as-other-type').click();
    const options = page.getByTestId('create-as-option');
    await expect(options).toHaveCount(1);
    await expect(options.first()).toHaveText('Daily Pages');
    await expect(options.first()).toHaveAttribute('href', new RegExp(`^/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}\\?`));
    await expect(options.first()).toHaveAttribute('href', /newPrompt=what\+do\+you\+already\+think/);

    // Choosing it opens that type with the prompt filled in.
    await options.first().click();
    await expect(page).toHaveURL(new RegExp(`/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}\\?`));
    await expect(page).toHaveURL(/back=stack/);
  });
});
