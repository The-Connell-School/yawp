import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag } from '../feature-flags';
import {
  EXIT_TICKET_EXPLAIN_CLOSER,
  EXIT_TICKET_QUESTIONS_LINE,
  exitTicketStarterOption,
} from '../../app/domain/assignment-types/exit-ticket-activities';
import {
  exitTicketCreateHref,
  readPlannedExitTickets,
} from '../../app/domain/lesson-planner/exit-ticket-block';

// The v3 exit ticket builder (docs/plans/2026-11-02-exit-ticket-builder-v3.md),
// behind `exit-ticket-builder-v3`. The teacher picks what students will do
// and fills in only what that choice needs. No grading. The quick-builder
// spec (teacher.exit-ticket.spec.ts) covers the flag-off form.

const QUESTION =
  'Who is Allie in The Catcher in the Rye, and why does Holden keep thinking about him?';
const ANSWER =
  'Allie is Holden’s younger brother, who died of leukemia. “His brother” is enough.';
const CONCEPT = 'how Edwards uses reason and emotion together';

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

  test('the form asks what students will do, and nothing about grading', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await expect(page.getByLabel('Title (optional)')).toBeVisible();
    await expect(page.getByLabel('Attachment (optional)')).toHaveCount(0);
    await expect(page.getByText('Grade this ticket')).toHaveCount(0);
    await expect(page.getByText('What are you checking for?')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Walk me through it' })
    ).toHaveCount(0);

    await expect(page.getByText('What will students do?')).toBeVisible();
    for (const name of [
      'What I learned',
      'Most interesting',
      'Still wondering',
      'Write your own question',
      'Have students explain a concept in their own words',
      'Have students answer a question you ask',
      'Have students understand or grapple with a text or source',
    ]) {
      await expect(page.getByRole('radio', { name })).toBeVisible();
    }
    await expect(
      page.getByRole('radio', { name: 'What I learned' })
    ).toBeChecked();
    await expect(
      page.getByRole('button', { name: /Create Assignment/i })
    ).toBeEnabled();

    await page.screenshot({
      path: 'test-results/exit-ticket-v3-builder.png',
      fullPage: true,
    });
  });

  test('a fixed reflection is ready with nothing typed', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page.getByRole('radio', { name: 'Still wondering' }).click();
    const wondering = exitTicketStarterOption('wondering')!.prompt;
    await expect(page.getByText(wondering)).toBeVisible();
    await expect(page.getByText(EXIT_TICKET_EXPLAIN_CLOSER)).toHaveCount(0);

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: wondering');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: wondering');
    expect(stored.prompt).toBe(wondering);
    expect(stored.exitTicketConfigJson).toMatchObject({
      mode: 'basic',
      activity: 'reflect',
      starter: 'wondering',
    });
    expect(stored.submitForGrade).toBe(false);
    expect(stored.tutorEnabled).toBe(false);
    expect(stored.promptAttachmentKey).toBeNull();
  });

  test('a teacher can write their own reflection question', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page.getByRole('radio', { name: 'Write your own question' }).click();
    const create = page.getByRole('button', { name: /Create Assignment/i });
    await expect(create).toBeDisabled();
    await page.getByLabel('Your question').fill('What will you try tomorrow?');
    await expect(create).toBeEnabled();
    await page.getByLabel('Title (optional)').fill('Exit ticket v3: own');
    await create.click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: own');
    expect(stored.prompt).toBe('What will you try tomorrow?');
  });

  test('answering a question with a correct answer, start to finish', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page.getByRole('radio', { name: 'Have students answer a question you ask' }).click();
    const create = page.getByRole('button', { name: /Create Assignment/i });
    await expect(create).toBeDisabled();
    await page.getByLabel('Question', { exact: true }).fill(QUESTION);
    await expect(create).toBeEnabled();

    // No correct answer is the default, so there is no answer box yet.
    await expect(page.getByRole('radio', { name: 'No' })).toBeChecked();
    await expect(page.getByLabel(/Describe the correct answer/)).toHaveCount(0);
    await page.getByRole('radio', { name: 'Yes' }).click();
    // The box is optional and never holds Create back.
    await expect(create).toBeEnabled();
    await page.getByLabel(/Describe the correct answer/).fill(ANSWER);

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: Allie');
    await create.click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: Allie');
    expect(stored.prompt).toBe(QUESTION);
    expect(stored.submitForGrade).toBe(false);
    expect(stored.exitTicketConfigJson).toMatchObject({
      mode: 'specific',
      activity: 'answer-question',
      promptText: QUESTION,
      answerType: 'objective',
      lessonNotes: { mustMention: ANSWER },
    });

    // Reopening keeps the choice, the question, and the answer.
    await page.goto('/app/assignments');
    await page.getByText('Exit ticket v3: Allie').first().click();
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    await expect(
      page.getByRole('radio', { name: 'Have students answer a question you ask' })
    ).toBeChecked();
    await expect(page.getByLabel('Question', { exact: true })).toHaveValue(QUESTION);
    await expect(page.getByRole('radio', { name: 'Yes' })).toBeChecked();
    await expect(page.getByLabel(/Describe the correct answer/)).toHaveValue(ANSWER);
  });

  test('explaining a concept takes only the concept', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);

    await page
      .getByRole('radio', {
        name: 'Have students explain a concept in their own words',
      })
      .click();
    await page.getByLabel('Which concept?').fill(CONCEPT);
    const prompt = `In your own words, explain ${CONCEPT}.`;
    await expect(page.getByText(prompt)).toBeVisible();
    await expect(page.getByText(EXIT_TICKET_EXPLAIN_CLOSER)).toBeVisible();

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: Edwards');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: Edwards');
    expect(stored.prompt).toBe(`${prompt}\n\n${EXIT_TICKET_EXPLAIN_CLOSER}`);
    expect(stored.submitForGrade).toBe(false);
    expect(stored.exitTicketConfigJson).toMatchObject({
      activity: 'explain-concept',
      topic: CONCEPT,
      answerType: 'subjective',
    });
  });

  test('the questions line and the note for Yawp! are optional extras', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);
    const create = page.getByRole('button', { name: /Create Assignment/i });

    // Neither is needed: the ticket is ready with both left alone.
    const line = page.getByLabel(/Add a line inviting questions/);
    const note = page.getByLabel(/Anything Yawp! should know/);
    await expect(line).not.toBeChecked();
    await expect(note).toHaveValue('');
    await expect(create).toBeEnabled();
    await expect(page.getByText(EXIT_TICKET_QUESTIONS_LINE)).toHaveCount(0);

    await line.check();
    await expect(page.getByText(EXIT_TICKET_QUESTIONS_LINE)).toBeVisible();
    await note.fill('We read chapters 1 to 3 and talked about Allie.');

    // "Still wondering" already asks for a question, so the line goes.
    await page.getByRole('radio', { name: 'Still wondering' }).click();
    await expect(line).toHaveCount(0);
    await page.getByRole('radio', { name: 'What I learned' }).click();
    await expect(line).toBeChecked();

    await page.getByLabel('Title (optional)').fill('Exit ticket v3: extras');
    await create.click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket('Exit ticket v3: extras');
    expect(stored.prompt).toEndWith(EXIT_TICKET_QUESTIONS_LINE);
    expect(stored.exitTicketConfigJson).toMatchObject({
      activity: 'reflect',
      starter: 'learned',
      invitesQuestions: true,
      lessonNotes: {
        mainPoints: 'We read chapters 1 to 3 and talked about Allie.',
      },
    });
  });

  for (const [name, block] of [
    [
      'a check with its answer',
      `activity: answer-question\npromptText: ${QUESTION}\nanswer: yes\nmustMention: ${ANSWER}`,
    ],
    [
      'a check the planner marked graded',
      `activity: answer-question\npromptText: ${QUESTION}\ngraded: yes\nbasis: understanding`,
    ],
    ['a reflection', 'activity: reflect\nstarter: wondering'],
  ] as const) {
    test(`a Lesson Planner hand-off (${name}) can be created right away`, async ({
      page,
      e2eContext,
      signIn,
    }) => {
      const [ticket] = readPlannedExitTickets(
        '```yawp-exit-ticket\n' + block + '\n```'
      ).tickets;
      expect(ticket).toBeTruthy();
      await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
      await page.goto(
        exitTicketCreateHref(e2eContext.exitTicketAssignmentTypeId, ticket!)
      );
      await expect(
        page.getByRole('heading', { name: 'New Assignment' })
      ).toBeVisible();
      await page.getByRole('checkbox', { name: /Grade 9th/ }).check();
      // Nothing left to fill in: every optional field may stay empty.
      await expect(
        page.getByRole('button', { name: /Create Assignment/i })
      ).toBeEnabled();
    });
  }

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

  test('a quick-builder check opens in v3 as the matching choice', async ({
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
          pointValue: null,
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
      page.getByRole('radio', {
        name: 'Have students explain a concept in their own words',
      })
    ).toBeChecked();
    await expect(page.getByLabel('Which concept?')).toHaveValue('erosion');
    await expect(page.getByRole('radio', { name: 'Yes' })).toBeChecked();
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
            prompt: QUESTION,
            assignmentTypeId: e2eContext.exitTicketAssignmentTypeId,
            submitForGrade: false,
            pointValue: null,
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
      await expect(page.getByTestId('lesson-planner-seed')).toBeVisible();
      // The summary is written into the planner's opening message.
      await expect(page.locator('textarea').first()).toHaveValue(
        /Recommendation: Quick review/
      );
    } finally {
      await setFeatureFlag('exit-ticket-class-summary', false);
    }
  });
});
