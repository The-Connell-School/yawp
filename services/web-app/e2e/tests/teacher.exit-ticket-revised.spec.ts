import { test, expect } from '../test-setup';
import { createE2EPrismaClient } from '../prisma-client';
import { setFeatureFlag } from '../feature-flags';

// The revised exit ticket builder (Brian, 2026-11-17), switched on with the
// Grading Assistant it was written for (`exit-ticket-grading-v2`). One Exit
// Ticket on the free tier and on main: no tutor, two stock reflections that
// invite a question, and a check the teacher writes in full with its correct
// answer or key points. teacher.exit-ticket.spec.ts covers the flag-off form.

const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const REFLECTION_TITLE = `Exit ticket: revised reflection ${runId}`;
const CHECK_TITLE = `Exit ticket: revised check ${runId}`;

const QUESTION =
  'Look at the first page of The Catcher in the Rye. Quote one line that shows Holden is an unreliable narrator, and explain how it shows that.';
const KEY =
  'A direct quote from page one; Holden exaggerates, contradicts himself, or admits he lies.';
const NO_TUTOR =
  'Exit tickets have no tutor. Students offer a quick reflection, a question, or their understanding of a concept. This is something they can do on their own without tutor support.';
const IDEAS = 'Ideas matter more than grammar or polish.';

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
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Whether the creation sheet is painted over an element, i.e. a person
 * cannot see it. An open menu turns pointer events off on everything else, so
 * a plain hit test sees straight through the sheet; switch it back on for the
 * test so the hit test follows what is drawn on top.
 */
async function isPaintedOverBySheet(
  locator: import('@playwright/test').Locator
): Promise<boolean> {
  return locator.evaluate((el) => {
    const sheet = document.querySelector<HTMLElement>(
      '[data-testid="assignment-creation-sheet"]'
    );
    const previous = sheet?.style.pointerEvents ?? '';
    if (sheet) sheet.style.pointerEvents = 'auto';
    const box = el.getBoundingClientRect();
    const top = document.elementFromPoint(
      box.x + box.width / 2,
      box.y + box.height / 2
    );
    if (sheet) sheet.style.pointerEvents = previous;
    return !(top && el.contains(top));
  });
}

test.describe.serial('Exit tickets, revised builder', () => {
  test.beforeAll(async () => {
    await setFeatureFlag('exit-ticket-grading-v2', true);
  });

  test.afterAll(async () => {
    await setFeatureFlag('exit-ticket-grading-v2', false);
  });

  test('a reflection: no tutor, three questions, each stock one invites a question', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);
    const sheet = page.getByTestId('assignment-creation-sheet');

    // No tutor toggle; the line that says why sits where it was.
    await expect(sheet.getByRole('checkbox', { name: /Tutor/ })).toHaveCount(0);
    await expect(sheet.getByText(NO_TUTOR)).toBeVisible();

    await expect(
      sheet.getByRole('radio', { name: /^Reflection/ })
    ).toBeChecked();
    await sheet.getByText('Why?').first().click();
    await expect(
      sheet.getByText(
        'It’s good for knowing whether students truly got the lesson.',
        { exact: false }
      )
    ).toBeVisible();

    const questions = sheet.getByRole('radiogroup', { name: 'Question' });
    await expect(questions.getByRole('radio')).toHaveCount(3);
    await expect(questions.getByText('Still wondering')).toHaveCount(0);

    const preview = sheet.getByTestId('exit-ticket-preview');
    await expect(preview).toContainText(
      'Tell me in your own words what you learned today.'
    );
    await expect(preview).toContainText(
      'Still have a question about today’s lesson? Ask it here too.'
    );
    await expect(preview).toContainText(IDEAS);

    await questions.getByRole('radio', { name: 'Most interesting' }).click();
    await expect(preview).toContainText(
      'What was the most interesting thing from today’s lesson?'
    );

    // Graded: points only, starting at 5. A reflection is full credit or none.
    await sheet.getByRole('checkbox', { name: 'Grade this ticket' }).check();
    await expect(sheet.getByLabel('How many points?')).toHaveValue('5');
    await expect(sheet.getByText('Graded on')).toHaveCount(0);
    await expect(sheet.getByText('Minimum length')).toHaveCount(0);
    await expect(sheet.getByText(/Main points/)).toHaveCount(0);

    await sheet.getByLabel('Title (optional)').fill(REFLECTION_TITLE);
    await sheet.getByRole('button', { name: /Create Assignment/i }).click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket(REFLECTION_TITLE);
    expect(stored.tutorEnabled).toBe(false);
    expect(stored.submitForGrade).toBe(true);
    expect(stored.pointValue).toBe(5);
    expect(stored.prompt).toBe(
      [
        'What was the most interesting thing from today’s lesson? Explain what it was and why it stuck with you.',
        'Still have a question about today’s lesson? Ask it here too.',
        IDEAS,
      ].join('\n\n')
    );
    expect(stored.exitTicketConfigJson).toMatchObject({
      promptVersion: 2,
      kind: 'reflection',
      grading: { basis: 'completion' },
    });
  });

  test('a check: the dropdown opens, the teacher writes the question and the key', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);
    const sheet = page.getByTestId('assignment-creation-sheet');
    await sheet.getByRole('radio', { name: /^Check for understanding/ }).click();

    // Gone: the yes/no question, the fill-in topic, and the mix-ups note.
    await expect(sheet.getByText('Is there a correct answer?')).toHaveCount(0);
    await expect(sheet.getByText('What specifically?')).toHaveCount(0);
    await expect(sheet.getByText(/Common mix-ups/)).toHaveCount(0);

    // The bug: the menu opened behind the sheet. It must be seen and used.
    await sheet.getByLabel('What are you checking for?').click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(2);
    const textOption = page.getByRole('option', {
      name: 'Understand a text or source',
    });
    await expect(textOption).toBeVisible();
    expect(await isPaintedOverBySheet(textOption)).toBe(false);
    await textOption.click();
    await expect(
      sheet.getByText('Did they read it closely, or just get the gist?')
    ).toBeVisible();

    const question = sheet.getByLabel('Your question');
    await expect(question).toHaveAttribute(
      'placeholder',
      `e.g., ${QUESTION}`
    );
    await question.fill(QUESTION);

    // Required, graded or not: Create waits for the key.
    const create = sheet.getByRole('button', { name: /Create Assignment/i });
    await expect(create).toBeDisabled();
    await expect(
      sheet.getByText(
        'What a correct response needs to include. Students don’t see this. Spelling and wording don’t count against them.'
      )
    ).toBeVisible();
    await sheet.getByLabel('Correct answer or key points').fill(KEY);

    const preview = sheet.getByTestId('exit-ticket-preview');
    await expect(preview).toHaveText(`${QUESTION}\n\n${IDEAS}`);

    await sheet.getByRole('checkbox', { name: 'Grade this ticket' }).check();
    await expect(sheet.getByLabel('How many points?')).toHaveValue('5');
    await sheet.getByLabel('Minimum sentences').fill('2');
    await expect(preview).toContainText('Write at least 2 sentences.');

    await sheet.getByLabel('Title (optional)').fill(CHECK_TITLE);
    await expect(create).toBeEnabled();
    await create.click();
    await expect(
      page.getByRole('heading', { name: 'New Assignment' })
    ).toHaveCount(0);

    const stored = await storedTicket(CHECK_TITLE);
    expect(stored.tutorEnabled).toBe(false);
    expect(stored.pointValue).toBe(5);
    expect(stored.prompt).toBe(
      `${QUESTION}\n\nWrite at least 2 sentences.\n\n${IDEAS}`
    );
    expect(stored.exitTicketConfigJson).toMatchObject({
      promptVersion: 2,
      kind: 'check',
      focus: 'understand-text',
      promptText: QUESTION,
      correctAnswer: KEY,
      grading: { basis: 'bands', minSentences: 2 },
    });
  });

  test('ungraded keeps its note and the new Why?', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);
    const sheet = page.getByTestId('assignment-creation-sheet');

    await expect(
      sheet.getByText(
        'Every response still gets feedback. Nothing goes in the gradebook.'
      )
    ).toBeVisible();
    await sheet.getByText('Why?').last().click();
    await expect(
      sheet.getByText(
        'Ungraded is the default because students answer honestly when there is nothing to lose by admitting what they missed, and you still see who understood it.'
      )
    ).toBeVisible();
    await expect(
      sheet.getByText(/A general question does not give enough to grade against/)
    ).toHaveCount(0);
  });
});

test.describe.serial('Exit tickets, current builder (flag off)', () => {
  test.beforeAll(async () => {
    await setFeatureFlag('exit-ticket-grading-v2', false);
  });

  test('the "What are you checking for?" menu opens in front of the sheet', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await openNewExitTicket(page, e2eContext.exitTicketAssignmentTypeId);
    const sheet = page.getByTestId('assignment-creation-sheet');
    await sheet.getByRole('radio', { name: /^Check for understanding/ }).click();
    await sheet.getByLabel('What are you checking for?').click();
    const textOption = page.getByRole('option', {
      name: 'Understand a text or source',
    });
    await expect(textOption).toBeVisible();
    expect(await isPaintedOverBySheet(textOption)).toBe(false);
    await textOption.click();
    await expect(
      sheet.getByText('Did they read it closely, or just get the gist?')
    ).toBeVisible();
  });
});
