import { test, expect } from '../test-setup';

// An exit ticket is the one assignment type a teacher does not write a prompt
// for: they answer the form and the product composes what students read. These
// tests walk the two shapes end to end and check the composed prompt is what
// actually lands on the assignment.

const BASIC_OPENING = 'Tell me, in your own words, what you learned today';
const TOPIC = 'the difference between weathering and erosion';
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
});
