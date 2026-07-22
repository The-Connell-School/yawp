import { test, expect } from '../test-setup';

function optionBody(topic: string) {
  return [
    `Write a thesis-driven critical essay on ${topic}.`,
    '',
    'Find the angle that actually grabs you and take an original position. Go where the emotional charge is.',
    '',
    'Your essay should be organized formally, with an introduction, thesis statement, body paragraphs, and a conclusion.',
  ].join('\n');
}

const GENERATED_OPTIONS = [
  { title: 'Ambition and Its Costs', body: optionBody('ambition and its costs') },
  { title: 'The Price of Power', body: optionBody('the price of unchecked power') },
  {
    title: 'Who Pays for Ambition',
    body: optionBody('who pays the price for another person’s ambition'),
  },
];

// Deterministic stand-in for the LLM so the flow is testable without a live
// model. Mirrors the structured contract the real route returns.
async function stubGenerator(page: import('@playwright/test').Page) {
  await page.route(
    '**/api/domain/thesis-prompt-generator',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          reply: 'Here are three drafts about ambition — tweak anything you like.',
          options: GENERATED_OPTIONS,
        }),
      });
    }
  );
}

test.describe.serial('Thesis-Driven Essay prompt generator', () => {
  test('teacher can page through generated options and turn one into an assignment', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await stubGenerator(page);
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'The Thesis-Driven Essay', level: 1 })
    ).toBeVisible();

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Generate a prompt' }).click();

    await expect(
      page.getByRole('heading', { name: 'Generate a prompt' })
    ).toBeVisible();

    await page
      .getByPlaceholder('Describe the prompt you want, or ask for a change…')
      .fill('A prompt about ambition for 10th graders reading Macbeth');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(
      page.getByText('Here are three drafts about ambition')
    ).toBeVisible();

    // Starts on the first of three options.
    await expect(
      page.getByRole('heading', { name: 'Ambition and Its Costs' })
    ).toBeVisible();
    await expect(page.getByText('Option 1 of 3')).toBeVisible();

    // Page forward to the third option, then use it.
    await page.getByRole('button', { name: 'Next option' }).click();
    await expect(
      page.getByRole('heading', { name: 'The Price of Power' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Next option' }).click();
    await expect(
      page.getByRole('heading', { name: 'Who Pays for Ambition' })
    ).toBeVisible();
    await expect(page.getByText('Option 3 of 3')).toBeVisible();

    await page.getByRole('button', { name: 'Use this prompt' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      /who pays the price for another person’s ambition/
    );
  });

  test('the generator is teacher-only and scoped to the thesis-driven essay type', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Students never see the teacher New menu, so the option is absent for them.
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'The Thesis-Driven Essay', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^New/ })
    ).toHaveCount(0);

    // Teachers on a different assignment type do not get the generator option.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await page.getByRole('button', { name: /^New/ }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Generate a prompt' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('menuitem', { name: 'Assignment' })
    ).toBeVisible();
  });
});
