import { test, expect } from '../test-setup';

const GENERATED_PROMPT_BODY = [
  'Write a thesis-driven critical essay on ambition and the price people pay to chase it.',
  '',
  'Find the angle that actually grabs you — a character who wanted too much, a moment ambition curdled into something darker, or a time you watched drive cost someone more than they expected. Go where the emotional charge is and take an original position you can defend.',
  '',
  'Your essay should be organized formally, with an introduction, thesis statement, body paragraphs, and a conclusion.',
].join('\n');

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
          reply: 'Here is a draft about ambition — tweak anything you like.',
          prompt: {
            title: 'Ambition and Its Costs',
            body: GENERATED_PROMPT_BODY,
          },
        }),
      });
    }
  );
}

test.describe.serial('Thesis-Driven Essay prompt generator', () => {
  test('teacher can generate a prompt and turn it into an assignment', async ({
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
      page.getByText('Here is a draft about ambition')
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Ambition and Its Costs' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Use this prompt' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      /thesis-driven critical essay on ambition/
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
