import { test, expect } from '../test-setup';

const SAVED_OPTION = {
  prompt: 'Nobody tells the truth about being bored. What does boredom feel like?',
  type: 'open-reflection',
  seriousness: 'light',
  cognitiveMoves: ['introspect'],
};
const USED_OPTION = {
  prompt: 'The hardest person to be honest with is yourself. Agree or disagree.',
  type: 'agree-disagree',
  seriousness: 'serious',
  cognitiveMoves: ['take-a-stance'],
};

// Deterministic stand-in for the LLM so the flow is testable without a live
// model. Mirrors the structured contract the real route returns.
async function stubGenerator(page: import('@playwright/test').Page) {
  await page.route(
    '**/api/domain/daily-pages-prompt-generator',
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
          reply: 'Here are two drafts — tweak anything you like.',
          options: [SAVED_OPTION, USED_OPTION],
        }),
      });
    }
  );
}

async function openGenerator(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Generate a prompt' }).click();
  await expect(
    page.getByRole('heading', { name: 'Generate a prompt' })
  ).toBeVisible();
  await page
    .getByPlaceholder(
      "Describe the prompt you want or just say what you're teaching"
    )
    .fill('Something honest for 10th graders');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Here are two drafts')).toBeVisible();
}

async function openMyPrompts(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /Prompt Library/i }).click();
  await expect(page.getByPlaceholder('Search prompts')).toBeVisible();
  const myPrompts = page.getByRole('checkbox', { name: 'My prompts' }).first();
  await expect(myPrompts).toBeVisible();
  if (!(await myPrompts.isChecked())) await myPrompts.check();
}

test.describe.serial('Daily Pages — My prompts', () => {
  test('saving a generated prompt puts it in the My prompts filter', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await stubGenerator(page);
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'Daily Pages', level: 1 })
    ).toBeVisible();

    await openGenerator(page);

    // The showing option offers both actions side by side.
    await expect(page.getByText(SAVED_OPTION.prompt)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Use this prompt' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Save prompt' }).click();
    await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();

    // Close the generator; the saved prompt is now in the library.
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: 'Generate a prompt' })
    ).toHaveCount(0);

    await openMyPrompts(page);
    await expect(page.getByText(SAVED_OPTION.prompt)).toBeVisible();
    // Corpus prompts are filtered out while My prompts is the active collection.
    await expect(
      page.getByText(
        'I am the captain of my destiny. Agree or disagree and explain your rationale.'
      )
    ).toHaveCount(0);

    // A saved prompt behaves like any other library prompt.
    await page.getByText(SAVED_OPTION.prompt).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      SAVED_OPTION.prompt
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
  });

  test('using a generated prompt saves it to My prompts automatically', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await stubGenerator(page);
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );

    await openGenerator(page);
    await page.getByRole('button', { name: 'Next option' }).click();
    await expect(page.getByText(USED_OPTION.prompt)).toBeVisible();
    await page.getByRole('button', { name: 'Use this prompt' }).click();

    // Same pre-filled Create Assignment path as before.
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      USED_OPTION.prompt
    );
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // ...and it was saved on the way through, with no extra click.
    await openMyPrompts(page);
    await expect(page.getByText(USED_OPTION.prompt)).toBeVisible();
    await expect(page.getByText(SAVED_OPTION.prompt)).toBeVisible();
  });

  test('saved prompts keep their tags and are scoped to Daily Pages', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await openMyPrompts(page);

    // The generator's tags survive the round trip, so a saved prompt still
    // answers the corpus facet filters.
    await page.getByRole('button', { name: 'Type', exact: true }).first().click();
    await page
      .getByRole('checkbox', { name: 'Agree / disagree' })
      .first()
      .check();
    await expect(page.getByText(USED_OPTION.prompt)).toBeVisible();
    await expect(page.getByText(SAVED_OPTION.prompt)).toHaveCount(0);

    // Saved prompts are scoped to the assignment type they were saved from.
    await page.goto(`/app/assignment-types/${e2eContext.assignmentTypeId}`);
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
  });

  test('students never see the My prompts collection', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.dailyPagesAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'Daily Pages', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole('checkbox', { name: 'My prompts' })
    ).toHaveCount(0);
  });
});
