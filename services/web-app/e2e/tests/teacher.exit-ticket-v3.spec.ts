import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag } from '../feature-flags';
import {
  EXIT_TICKET_EXPLAIN_CLOSER,
  EXIT_TICKET_POLISH_CLOSER,
  exitTicketStarterOption,
} from '../../app/domain/assignment-types/exit-ticket-activities';

// The v3 exit ticket builder (docs/plans/2026-11-02-exit-ticket-builder-v3.md),
// behind `exit-ticket-builder-v3`. The teacher picks what students will do,
// writes the prompt, and optionally adds the answer or key points. The
// quick-builder spec (teacher.exit-ticket.spec.ts) covers the flag-off form.

const QUESTION =
  'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?';
const KEY_POINTS = 'Allie is Holden’s younger brother, who died of leukemia.';
const EXPLAIN =
  'In your own words, explain how Edwards uses reason and emotion together.';

async function openNewExitTicket(
  page: import('@playwright/test').Page,
  exitTicketAssignmentTypeId: string
) {
  await page.goto(`/app/assignment-types/${exitTicketAssignmentTypeId}`);
  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'New Assignment' })
  ).toBeVisible();
  await page.getByRole('checkbox', { name: /Grade 9th/ }).check();
}

async function storedTicket(title: string) {
  const prisma = createE2EPrismaClient();
  try {
    return await prisma.assignment.findFirstOrThrow({
      where: { title },
      orderBy: { createdAt: 'desc' },
      select: {
        prompt: true,
        exitTicketConfigJson: true,
        submitForGrade: true,
        pointValue: true,
        tutorEnabled: true,
        promptAttachmentKey: true,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('Exit tickets, v3 builder', () => {
  test.beforeAll(async () => {
    await setFeatureFlag('exit-ticket-builder-v3', true);
  });
  test.afterAll(async () => {
    await setFeatureFlag('exit-ticket-builder-v3', false);
  });

  test('the form is title, dates, what students do, and the prompt', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await expect(page.getByLabel('Title (optional)')).toBeVisible();
    await expect(page.getByLabel(/^Post date/)).toBeVisible();
    await expect(page.getByLabel(/^Due date/)).toBeVisible();
    // No file to choose or attach, and none of the quick builder's extras.
    await expect(page.getByLabel('Attachment (optional)')).toHaveCount(0);
    await expect(page.getByText('Is there a correct answer?')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Walk me through it' })
    ).toHaveCount(0);

    // Two groups, four things students can do, each described.
    await expect(page.getByText('Reflection / question')).toBeVisible();
    await expect(page.getByText('Check for understanding')).toBeVisible();
    for (const name of [
      /^Have the students reflect or ask a question/,
      /^Have the students explain a concept/,
      /^Have the students answer a question/,
      /^Have the students engage with a text or source/,
    ]) {
      await expect(page.getByRole('radio', { name })).toBeVisible();
    }
    await expect(
      page.getByRole('radio', { name: /^Have the students reflect/ })
    ).toBeChecked();
    await expect(
      page.getByText(/quick question about what you just taught/)
    ).toBeVisible();

    await page.screenshot({
      path: 'test-results/exit-ticket-v3-builder.png',
      fullPage: true,
    });
  });

  test('a reflection is ready with only a title', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    const learned = exitTicketStarterOption('learned')!.prompt;
    await expect(page.getByLabel('Prompt')).toHaveValue(learned);
    await expect(
      page.getByRole('button', { name: 'What I learned' })
    ).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: 'Still wondering' }).click();
    const wondering = exitTicketStarterOption('wondering')!.prompt;
    await expect(page.getByLabel('Prompt')).toHaveValue(wondering);
    // A question they still have just asks: no push to write more.
    await expect(page.getByText(EXIT_TICKET_EXPLAIN_CLOSER)).toHaveCount(0);

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: wondering');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: wondering');
    expect(stored.prompt).toBe(`${wondering}\n\n${EXIT_TICKET_POLISH_CLOSER}`);
    expect(stored.exitTicketConfigJson).toMatchObject({
      mode: 'basic',
      activity: 'reflect',
      starter: 'wondering',
    });
    expect(stored.submitForGrade).toBe(false);
    expect(stored.tutorEnabled).toBe(false);
    expect(stored.promptAttachmentKey).toBeNull();
  });

  test('answering a question takes the teacher’s question and key points', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page
      .getByRole('radio', { name: /^Have the students answer a question/ })
      .click();
    const create = page.getByRole('button', { name: /Create Assignment/i });
    // A check starts with an empty prompt, and cannot be created without one.
    await expect(page.getByLabel('Prompt')).toHaveValue('');
    await expect(create).toBeDisabled();

    await page.getByLabel('Prompt').fill(QUESTION);
    await page.getByLabel(/Correct answer or key points/).fill(KEY_POINTS);
    await expect(page.getByText(QUESTION).last()).toBeVisible();
    await expect(create).toBeEnabled();

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: Allie');
    await create.click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: Allie');
    expect(stored.prompt).toBe(`${QUESTION}\n\n${EXIT_TICKET_POLISH_CLOSER}`);
    expect(stored.exitTicketConfigJson).toMatchObject({
      mode: 'specific',
      activity: 'answer-question',
      promptText: QUESTION,
      answerType: 'subjective',
      lessonNotes: { mustMention: KEY_POINTS },
    });

    // Reopening keeps the activity, the question, and the key points.
    await page.goto('/app/assignments');
    await page.getByText('Exit ticket v3: Allie').first().click();
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    await expect(
      page.getByRole('radio', { name: /^Have the students answer a question/ })
    ).toBeChecked();
    await expect(page.getByLabel('Prompt')).toHaveValue(QUESTION);
    await expect(page.getByLabel(/Correct answer or key points/)).toHaveValue(
      KEY_POINTS
    );
  });

  test('explaining a concept ends on the own-words line, and can be graded for completion', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page
      .getByRole('radio', { name: /^Have the students explain a concept/ })
      .click();
    await page.getByLabel('Prompt').fill(EXPLAIN);
    await expect(page.getByText(EXIT_TICKET_EXPLAIN_CLOSER)).toBeVisible();

    await expect(page.getByLabel('Grade this ticket')).not.toBeChecked();
    await expect(page.getByText(/Grading is optional/)).toBeVisible();
    await page.getByLabel('Grade this ticket').check();
    await expect(page.getByLabel('How many points?')).toHaveValue('10');
    await expect(
      page.getByRole('radio', { name: /^Completion/ })
    ).toBeChecked();
    // No criteria demanded: the prompt is enough to read against.
    await page.getByRole('radio', { name: /^Understanding/ }).click();
    await page.getByRole('radio', { name: /^Completion/ }).click();

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: Edwards');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: Edwards');
    expect(stored.prompt).toBe(`${EXPLAIN}\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`);
    expect(stored.submitForGrade).toBe(true);
    expect(stored.pointValue).toBe(10);
    expect(stored.exitTicketConfigJson).toMatchObject({
      activity: 'explain-concept',
      grading: { basis: 'completion' },
    });
  });

  test('the tutor starts off and says when to turn it on', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page.getByText('More options').click();
    await expect(page.getByLabel('Tutor enabled')).not.toBeChecked();
    await expect(page.getByText(/tends to hand in six words/)).toBeVisible();
  });

  test('a quick-builder check opens in v3 as the matching activity', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Written as the quick builder would, then opened with the flag on.
    const prisma = createE2EPrismaClient();
    const assignmentTitle = 'Exit ticket v3: legacy check';
    try {
      const assignment = await prisma.assignment.create({
        data: {
          title: assignmentTitle,
          prompt: 'In your own words, explain erosion.',
          assignmentTypeId: e2eContext.exitTicketAssignmentTypeId,
          submitForGrade: false,
          tutorEnabled: false,
          exitTicketConfigJson: {
            schemaVersion: 1,
            mode: 'specific',
            kind: 'check',
            focus: 'explain-concept',
            topic: 'erosion',
            answerType: 'objective',
          },
        },
        select: { id: true },
      });
      await prisma.classAssignment.create({
        data: { assignmentId: assignment.id, classId: e2eContext.classId },
      });
    } finally {
      await prisma.$disconnect();
    }

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');
    await page.getByText(assignmentTitle).first().click();
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    await expect(
      page.getByRole('radio', { name: /^Have the students explain a concept/ })
    ).toBeChecked();
    await expect(page.getByLabel('Prompt')).toHaveValue(
      'In your own words, explain erosion.'
    );
  });

  test('the class summary reads every response and plans tomorrow from it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setFeatureFlag('exit-ticket-class-summary', true);
    try {
      const title = 'Exit ticket v3: summary';
      const prisma = createE2EPrismaClient();
      let assignmentId: string;
      try {
        const assignment = await prisma.assignment.create({
          data: {
            title,
            prompt: `${QUESTION}\n\n${EXIT_TICKET_POLISH_CLOSER}`,
            assignmentTypeId: e2eContext.exitTicketAssignmentTypeId,
            submitForGrade: false,
            tutorEnabled: false,
          },
          select: { id: true },
        });
        assignmentId = assignment.id;
        const classAssignment = await prisma.classAssignment.create({
          data: { assignmentId, classId: e2eContext.classId },
          select: { id: true },
        });
        for (const text of [
          'Allie is his little brother who died.',
          'He is Holden’s brother, D.B.?',
          'A friend from Pencey.',
        ]) {
          const document = await prisma.document.create({
            data: {
              title,
              text,
              html: `<p>${text}</p>`,
              membershipId: e2eContext.membershipId,
              assignmentTypeId: e2eContext.exitTicketAssignmentTypeId,
              assignmentId,
              classAssignmentId: classAssignment.id,
            },
            select: { id: true },
          });
          await prisma.submission.create({
            data: {
              documentId: document.id,
              text,
              html: `<p>${text}</p>`,
              title,
              submittedAt: new Date(),
            },
          });
        }
      } finally {
        await prisma.$disconnect();
      }

      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(`/app/assignments/${assignmentId}`);
      const summary = page.getByTestId('exit-ticket-summary');
      await summary
        .getByRole('button', { name: 'Summarize responses' })
        .click();
      // E2E runs the summary in fixture mode: no model call.
      await expect(summary).toContainText('Across 3 responses');
      await expect(summary).toContainText('Quick review');
      await expect(summary).toContainText('Tomorrow: Explain it back');
      await expect(summary).toContainText(
        'Every response is still in the list below.'
      );
      // Nothing new since, so nothing to click.
      await expect(summary.getByRole('button')).toHaveCount(0);
      await page.screenshot({
        path: 'test-results/exit-ticket-class-summary.png',
        fullPage: true,
      });

      await page.getByTestId('exit-ticket-plan-tomorrow').click();
      await expect(page.getByTestId('lesson-planner-seed')).toContainText(
        'Recommendation: Quick review'
      );
    } finally {
      await setFeatureFlag('exit-ticket-class-summary', false);
    }
  });
});
