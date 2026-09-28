import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';

// An exit ticket is the one assignment type a teacher does not write a prompt
// for: they answer the form and the product composes what students read. These
// tests walk the two shapes end to end and check the composed prompt is what
// actually lands on the assignment.

const BASIC_OPENING = 'Tell me, in your own words, what you learned today';
const TOPIC = 'the difference between weathering and erosion';
const CORRECT_ANSWER = 'Weathering breaks rock down; erosion carries it away.';
const CUSTOM_QUESTION = 'What would you teach a friend who missed today?';

async function openNewAssignmentSheet(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'New Assignment' })
  ).toBeVisible();
  // Nothing can be created until it is assigned somewhere.
  await page.getByRole('checkbox', { name: /Grade 9th/ }).check();
}

test.describe.serial('Exit tickets', () => {
  test('a reflection is the default and needs only a title', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'Exit Ticket', level: 1 })
    ).toBeVisible();

    await openNewAssignmentSheet(page);

    // No prompt box at all: the teacher answers the form instead.
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveCount(0);

    // Reflection or check is the first choice, and reflection is where the
    // form opens, with the preview already filled in.
    await expect(
      page.getByRole('radio', { name: /^Reflection/ })
    ).toBeChecked();
    await expect(
      page.getByRole('radio', { name: /^Check for understanding/ })
    ).not.toBeChecked();
    await expect(page.getByText(BASIC_OPENING)).toBeVisible();

    await page.getByLabel('Title (optional)').fill('Exit ticket: Tuesday');
    await page.getByRole('button', { name: /Create Assignment/i }).click();

    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);
  });

  test('a check for understanding asks what to check for and previews it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );

    await openNewAssignmentSheet(page);
    await page.getByRole('radio', { name: /^Check for understanding/ }).click();

    // The dropdown names the kind of understanding; the field names the topic.
    await expect(page.getByText('What are you checking for?')).toBeVisible();
    await page.getByLabel('What are you checking for?').click();
    await page.getByRole('option', { name: 'Explain a concept' }).click();
    await page.getByLabel('What specifically?').fill(TOPIC);
    await page.getByRole('radio', { name: /^Yes/ }).click();

    // The teacher approves the exact wording before a class ever sees it.
    await expect(page.getByText(TOPIC).last()).toBeVisible();
    await expect(page.getByText(BASIC_OPENING)).toHaveCount(0);

    await page.getByLabel('Title (optional)').fill('Exit ticket: erosion');
    await page.getByRole('button', { name: /Create Assignment/i }).click();

    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);
  });

  test('reopening a check keeps what it was checking for', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/assignments');

    // Editing must not quietly turn a specific exit ticket back into the
    // generic one, which is what a form that reset to Basic would do.
    await page.getByText('Exit ticket: erosion').first().click();
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'Edit Assignment' })
    ).toBeVisible();

    await expect(
      page.getByRole('radio', { name: /^Check for understanding/ })
    ).toBeChecked();
    await expect(page.getByLabel('What specifically?')).toHaveValue(TOPIC);
    await expect(page.getByText(TOPIC).last()).toBeVisible();
  });

  test("a reflection can ask a suggested question or the teacher's own", async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );
    await openNewAssignmentSheet(page);

    await page.getByRole('radio', { name: 'Still wondering' }).click();
    await expect(
      page.getByText('What is one question you still have')
    ).toBeVisible();
    await expect(page.getByText(BASIC_OPENING)).toHaveCount(0);

    await page.getByRole('radio', { name: 'Write your own' }).click();
    await page.getByLabel('Your question').fill(CUSTOM_QUESTION);
    await expect(page.getByText(CUSTOM_QUESTION).last()).toBeVisible();

    await page.getByLabel('Title (optional)').fill('Exit ticket: own question');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    // Reopening keeps the teacher's own words rather than resetting to the
    // default question.
    await page.goto('/app/assignments');
    await page.getByText('Exit ticket: own question').first().click();
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    await expect(
      page.getByRole('radio', { name: 'Write your own' })
    ).toBeChecked();
    await expect(page.getByLabel('Your question')).toHaveValue(CUSTOM_QUESTION);
  });

  test('grading a check asks for points and the correct answer', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );
    await openNewAssignmentSheet(page);

    await page.getByRole('radio', { name: /^Check for understanding/ }).click();
    await page.getByLabel('What are you checking for?').click();
    await page.getByRole('option', { name: 'Explain a concept' }).click();
    await page.getByLabel('What specifically?').fill(TOPIC);
    await page.getByRole('radio', { name: /^Yes/ }).click();

    // Ungraded until the teacher says otherwise.
    await expect(page.getByLabel('Grade this ticket')).not.toBeChecked();
    await page.getByLabel('Grade this ticket').check();
    await page.getByLabel('How many points?').fill('5');
    // Always bands: there is no steps option to reach for.
    await expect(page.getByText(/in\s+bands/)).toBeVisible();
    await page.getByRole('button', { name: 'Change' }).click();
    await expect(page.getByRole('button', { name: 'Steps' })).toHaveCount(0);

    // Points without an answer key is not something that can be graded.
    const create = page.getByRole('button', { name: /Create Assignment/i });
    await page.getByLabel('Title (optional)').fill('Exit ticket: graded check');
    await expect(create).toBeDisabled();
    await page.getByLabel('Correct answer or key points').fill(CORRECT_ANSWER);
    await expect(create).toBeEnabled();
    await create.click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    await page.goto('/app/assignments');
    await page.getByText('Exit ticket: graded check').first().click();
    await page
      .getByRole('button', { name: /^Edit$/ })
      .first()
      .click();
    await expect(page.getByLabel('Grade this ticket')).toBeChecked();
    await expect(page.getByLabel('How many points?')).toHaveValue('5');
    await expect(page.getByLabel('Correct answer or key points')).toHaveValue(
      CORRECT_ANSWER
    );
  });

  test('the quick default keeps the rest tucked away, and can walk through it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );
    await openNewAssignmentSheet(page);

    // Tutor, groups and notes wait under "More options".
    await expect(page.getByLabel('Tutor enabled')).toBeHidden();
    await page.getByText('More options').click();
    await expect(page.getByLabel('Tutor enabled')).toBeVisible();
    await expect(page.getByLabel('Tutor enabled')).not.toBeChecked();

    // Explanations are there for anyone who asks.
    await expect(page.getByText(/nothing to lose by admitting/)).toBeHidden();
    await page.getByText('Why?').nth(1).click();
    await page.screenshot({
      path: 'test-results/exit-ticket-quick-builder.png',
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Walk me through it' }).click();
    await expect(page.getByText('Step 1 of 3')).toBeVisible();
    await page.getByRole('radio', { name: /^Reflection/ }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Step 2 of 3')).toBeVisible();
    await page.getByRole('radio', { name: 'Most interesting' }).click();
    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText('Step 3 of 3')).toBeVisible();
    await page.screenshot({
      path: 'test-results/exit-ticket-guided.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Done' }).click();

    await page.getByLabel('Title (optional)').fill('Exit ticket: guided');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);
  });

  test('the class read shows how the tickets came back and plans tomorrow', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );
    await openNewAssignmentSheet(page);
    await page.getByLabel('Title (optional)').fill('Exit ticket: class read');
    await page.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    // One ticket back, read and scored, with a question in it.
    const prisma = createE2EPrismaClient();
    let assignmentId: string;
    try {
      await prisma.organization.update({
        where: { id: e2eContext.organizationId },
        data: { lessonPlannerEnabled: true },
      });
      const classAssignment = await prisma.classAssignment.findFirstOrThrow({
        where: {
          classId: e2eContext.classId,
          assignment: { title: 'Exit ticket: class read' },
        },
        select: { id: true, assignmentId: true },
      });
      assignmentId = classAssignment.assignmentId;
      const text =
        'Weathering breaks the rock. Why does erosion need water to move it?';
      const document = await prisma.document.create({
        data: {
          title: 'Exit ticket: class read',
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
          title: 'Exit ticket: class read',
          submittedAt: new Date(),
          gradedAt: new Date(),
          rubricScores: { understanding: { score: 30, isAi: true } },
        },
      });
    } finally {
      await prisma.$disconnect();
    }

    await page.goto(`/app/assignments/${assignmentId}`);
    const panel = page.getByTestId('exit-ticket-class-read');
    await expect(panel).toContainText('1 of 1 responses read');
    await expect(panel).toContainText('Names it only');
    await expect(panel).toContainText(
      'Why does erosion need water to move it?'
    );
    await page.screenshot({
      path: 'test-results/exit-ticket-class-read.png',
      fullPage: true,
    });

    await panel.getByTestId('exit-ticket-plan-tomorrow').click();
    await expect(page).toHaveURL(/\/app\/lesson-planner/);
    await expect(page.getByTestId('lesson-planner-seed')).toContainText(
      'Exit ticket: class read'
    );
  });
});
