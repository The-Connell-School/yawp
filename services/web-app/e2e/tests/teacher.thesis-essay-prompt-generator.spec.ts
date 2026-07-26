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

async function openGenerator(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: /^New/ }).click();
  await page.getByRole('menuitem', { name: 'Generate a prompt' }).click();
  await expect(
    page.getByRole('heading', { name: 'Generate a prompt' })
  ).toBeVisible();
}

async function sendGeneratorMessage(
  page: import('@playwright/test').Page,
  text: string
) {
  await page
    .getByPlaceholder(
      "Describe the prompt you want or just say what you're teaching"
    )
    .fill(text);
  await page.getByRole('button', { name: 'Send' }).click();
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
      .getByPlaceholder(
        "Describe the prompt you want or just say what you're teaching"
      )
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

test.describe.serial('Thesis-Driven Essay prompt generator history', () => {
  // No client-side stub here: the request has to reach the real action for the
  // conversation to be saved. The server answers from its deterministic e2e
  // fixture (E2E_THESIS_PROMPT_GENERATOR_FIXTURE), which returns the same three
  // options as GENERATED_OPTIONS above.
  test('a teacher can reopen a prompt they generated earlier', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await openGenerator(page);
    await sendGeneratorMessage(
      page,
      'A prompt about ambition for 10th graders reading Macbeth'
    );
    await expect(
      page.getByRole('heading', { name: 'Ambition and Its Costs' })
    ).toBeVisible();

    // Reload so nothing survives in component state, then reopen the sheet.
    await page.reload();
    await openGenerator(page);

    // The chat starts fresh, but the earlier conversation is listed.
    await expect(
      page.getByRole('heading', { name: 'Ambition and Its Costs' })
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Past prompts' }).click();
    const saved = page.getByRole('button', {
      name: /A prompt about ambition for 10th graders reading Macbeth/,
    });
    await expect(saved).toBeVisible();

    // Reopening replays the whole exchange, drafts included.
    await saved.click();
    await expect(
      page.getByRole('heading', { name: 'Ambition and Its Costs' })
    ).toBeVisible();
    await expect(page.getByText('Option 1 of 3')).toBeVisible();

    // And a replayed draft is still assignable.
    await page.getByRole('button', { name: 'Use this prompt' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      /ambition and its costs/
    );
  });

  test('a follow-up keeps building the same saved conversation', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.thesisEssayAssignmentTypeId}`
    );

    await openGenerator(page);
    await page.getByRole('button', { name: 'Past prompts' }).click();
    const savedBefore = await page
      .getByRole('button', { name: /A prompt about ambition/ })
      .count();

    // Iterating in a replayed chat must append to it, not fork a new one.
    await page
      .getByRole('button', { name: /A prompt about ambition/ })
      .first()
      .click();
    await sendGeneratorMessage(page, 'Make them more about fate.');
    await expect(page.getByText('Make them more about fate.')).toBeVisible();

    await page.reload();
    await openGenerator(page);
    await page.getByRole('button', { name: 'Past prompts' }).click();
    await expect(
      page.getByRole('button', { name: /A prompt about ambition/ })
    ).toHaveCount(savedBefore);
  });
});
