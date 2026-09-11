import { test, expect } from '../test-setup';

// An exit ticket is the one assignment type a teacher does not write a prompt
// for: they answer the form and the product composes what students read. These
// tests walk the two shapes end to end and check the composed prompt is what
// actually lands on the assignment.

const BASIC_OPENING = 'Tell me, in your own words, what you learned today';
const TOPIC = 'the difference between weathering and erosion';

async function openNewAssignmentSheet(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Assignment' }).click();
  await expect(
    page.getByRole('heading', { name: 'New Assignment' })
  ).toBeVisible();
}

test.describe.serial('Exit tickets', () => {
  test('a basic exit ticket is one click and shows the standard prompt', async ({
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
    await expect(page.getByText('Basic exit ticket')).toBeVisible();

    // Basic is where the form opens, and the preview is already filled in.
    await expect(page.getByText(BASIC_OPENING)).toBeVisible();

    await page.getByLabel('Title (optional)').fill('Exit ticket: Tuesday');
    await page.getByRole('button', { name: /Create Assignment/i }).click();

    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);
  });

  test('a specific exit ticket asks what to check for and previews it', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.exitTicketAssignmentTypeId}`
    );

    await openNewAssignmentSheet(page);
    await page.getByText('Specific exit ticket').click();

    // The dropdown names the kind of understanding; the field names the topic.
    await expect(page.getByText('What are you checking for?')).toBeVisible();
    await page.getByLabel('What are you checking for?').click();
    await page.getByRole('option', { name: 'Explain a concept' }).click();
    await page.getByLabel('What specifically?').fill(TOPIC);

    // The teacher approves the exact wording before a class ever sees it.
    await expect(page.getByText(TOPIC).last()).toBeVisible();
    await expect(page.getByText(BASIC_OPENING)).toHaveCount(0);

    await page.getByLabel('Title (optional)').fill('Exit ticket: erosion');
    await page.getByRole('button', { name: /Create Assignment/i }).click();

    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);
  });

  test('reopening a specific exit ticket keeps what it was checking for', async ({
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

    await expect(page.getByLabel('What specifically?')).toHaveValue(TOPIC);
    await expect(page.getByText(TOPIC).last()).toBeVisible();
  });
});
