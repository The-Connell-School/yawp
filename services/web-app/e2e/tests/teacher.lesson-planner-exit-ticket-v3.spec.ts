import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag } from '../feature-flags';

// The Lesson Planner with the v3 exit ticket builder on
// (docs/plans/2026-11-02-exit-ticket-builder-v3.md). The planner offers three
// tickets side by side; each card shows the prompt students will read, and
// the starter tile asks for nothing but the lesson. Uses a pre-written planner
// reply, so no model is called.

const TEACHER_PASSWORD = 'teacher-e2e-password';
const ALLIE =
  'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?';
const STANZA =
  'Reread the second stanza. Find two examples of enjambment and say what each one does to the poem’s pace.';
const WONDERING = 'What is one question you still have about today’s lesson?';
const KEY_POINTS = 'Allie is Holden’s younger brother, who died of leukemia.';

async function seedThreeV3Tickets(e2eContext: {
  teacherMembershipId: string;
  organizationId: string;
}) {
  const block = (lines: string[]) =>
    '```yawp-exit-ticket\n' + lines.join('\n') + '\n```';
  const prisma = createE2EPrismaClient();
  try {
    const conversation = await prisma.lessonPlanConversation.create({
      data: {
        membershipId: e2eContext.teacherMembershipId,
        organizationId: e2eContext.organizationId,
        title: 'Catcher exit ticket',
        messages: {
          create: [
            {
              role: 'user',
              content: 'Make me an exit ticket for today’s Catcher lesson.',
              createdAt: new Date('2026-11-11T10:00:00.000Z'),
            },
            {
              role: 'assistant',
              content:
                'Three to choose from: what they still wonder, Allie, or the second stanza.\n\n' +
                block([
                  'activity: reflect',
                  'starter: wondering',
                  `promptText: ${WONDERING}`,
                ]) +
                '\n\n' +
                block([
                  'activity: answer-question',
                  `promptText: ${ALLIE}`,
                  `mustMention: ${KEY_POINTS}`,
                ]) +
                '\n\n' +
                block(['activity: engage-text', `promptText: ${STANZA}`]),
              createdAt: new Date('2026-11-11T10:00:01.000Z'),
            },
          ],
        },
      },
      select: { id: true },
    });
    return { conversationId: conversation.id };
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Lesson Planner exit tickets, v3 builder', () => {
  test.beforeAll(async () => {
    await setFeatureFlag('exit-ticket-builder-v3', true);
  });
  test.afterAll(async () => {
    await setFeatureFlag('exit-ticket-builder-v3', false);
  });

  test('the options row shows each prompt as students will read it', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { conversationId } = await seedThreeV3Tickets(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const row = page.getByTestId('option-row');
    await expect(row).toContainText('Exit ticket options');
    const cards = row.getByTestId('exit-ticket-card');
    await expect(cards).toHaveCount(3);

    // Each card is its question, then the line Yawp! adds.
    await expect(cards.nth(0).getByTestId('exit-ticket-question')).toHaveText(
      WONDERING
    );
    await expect(cards.nth(1).getByTestId('exit-ticket-question')).toHaveText(
      ALLIE
    );
    // A question gets no closing line; Yawp! adds one only to "explain".
    await expect(cards.nth(1).getByTestId('exit-ticket-closer')).toHaveCount(0);
    await expect(cards.nth(2).getByTestId('exit-ticket-question')).toHaveText(
      STANZA
    );

    // A short tag says what students do; nothing says "Ungraded".
    await expect(cards.nth(1).getByTestId('exit-ticket-activity')).toHaveText(
      'Answer a question'
    );
    await expect(row).not.toContainText('Ungraded');

    // Only what students read: the key points stay off the card. They
    // still travel to the form (next test).
    await expect(row.getByTestId('exit-ticket-notes')).toHaveCount(0);
    await expect(row).not.toContainText(KEY_POINTS);
  });

  test('creating one opens the v3 form on exactly that question', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { conversationId } = await seedThreeV3Tickets(e2eContext);
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto(`/app/lesson-planner?c=${conversationId}`);

    const allie = page
      .getByTestId('exit-ticket-card')
      .filter({ hasText: 'Who is Allie' });
    await allie.getByTestId('exit-ticket-create').click();
    await expect(page).toHaveURL(
      new RegExp(
        `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
      )
    );
    await expect(
      page.getByRole('radio', { name: 'Have students answer a question you ask' })
    ).toBeChecked();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue(
      ALLIE
    );
    // The planner's key points arrive as the correct answer.
    await expect(page.getByRole('radio', { name: 'Yes' })).toBeChecked();
    await expect(page.getByLabel(/Describe the correct answer/)).toHaveValue(
      KEY_POINTS
    );
    await expect(
      page.getByRole('button', { name: /Create Assignment/i })
    ).toBeDisabled(); // only until a class is picked
    await page.getByRole('checkbox', { name: /Grade 9th/ }).check();
    await expect(
      page.getByRole('button', { name: /Create Assignment/i })
    ).toBeEnabled();
  });

  test('the exit ticket starter asks for nothing but the lesson', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app/lesson-planner');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /Make me an exit ticket/ }).click();
    await expect(page.locator('[data-role="user"]').first()).toContainText(
      'ask me that and nothing else'
    );
  });
});
