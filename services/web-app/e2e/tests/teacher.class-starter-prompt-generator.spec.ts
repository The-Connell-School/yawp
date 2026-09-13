import { test, expect } from '../test-setup';

const GENERATED_OPTIONS = [
  {
    prompt:
      'You become who you spend time with. Defend, complicate, or reject this.',
    type: 'agree-disagree',
    seriousness: 'moderate',
    cognitiveMoves: ['take-a-stance'],
  },
  {
    prompt:
      "What's a version of yourself you only show to one person? Why that person?",
    type: 'open-reflection',
    seriousness: 'serious',
    cognitiveMoves: ['introspect'],
  },
  {
    prompt:
      'If you woke up tomorrow as someone everyone liked, what would you have lost?',
    type: 'hypothetical',
    seriousness: 'light',
    cognitiveMoves: ['imagine'],
  },
];

// Deterministic stand-in for the LLM so the flow is testable without a live
// model. Mirrors the structured contract the real route returns.
async function stubGenerator(page: import('@playwright/test').Page) {
  await page.route(
    '**/api/domain/class-starter-prompt-generator',
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
          reply: 'Here are three angles on identity — tweak anything you like.',
          options: GENERATED_OPTIONS,
        }),
      });
    }
  );
}

test.describe.serial('Class Starter prompt generator', () => {
  test('teacher can page through generated options and turn one into an assignment', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await stubGenerator(page);
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );

    await expect(
      page.getByRole('heading', { name: 'Class Starter', level: 1 })
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
      .fill('Something about identity for 10th graders');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(
      page.getByText('Here are three angles on identity')
    ).toBeVisible();

    // Starts on the first of three options, tagged like a library row.
    await expect(page.getByText(GENERATED_OPTIONS[0].prompt)).toBeVisible();
    await expect(page.getByText('Option 1 of 3')).toBeVisible();
    await expect(
      page.getByRole('dialog').getByText('Agree / disagree')
    ).toBeVisible();

    // Both actions are offered on whichever option is showing.
    await expect(
      page.getByRole('button', { name: 'Save prompt' })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Use this prompt' })
    ).toBeVisible();

    // Page forward to the third option, then use it.
    await page.getByRole('button', { name: 'Next option' }).click();
    await expect(page.getByText(GENERATED_OPTIONS[1].prompt)).toBeVisible();
    await page.getByRole('button', { name: 'Next option' }).click();
    await expect(page.getByText(GENERATED_OPTIONS[2].prompt)).toBeVisible();
    await expect(page.getByText('Option 3 of 3')).toBeVisible();

    await page.getByRole('button', { name: 'Use this prompt' }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      GENERATED_OPTIONS[2].prompt
    );
  });

  test('the generator leaves the blank assignment path untouched', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Assignment' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue('');
  });

  test('the generator is teacher-only and scoped to Class Starter', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    // Students never see the teacher New menu, so the option is absent for them.
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(
      `/app/assignment-types/${e2eContext.classStarterAssignmentTypeId}`
    );
    await expect(
      page.getByRole('heading', { name: 'Class Starter', level: 1 })
    ).toBeVisible();
    // The student New button is a plain submit, not the teacher dropdown, so
    // there is no menu to open and no generator to reach.
    await expect(
      page.getByRole('button', { name: /Prompt Library/i })
    ).toHaveCount(0);
    await expect(
      page.getByRole('menuitem', { name: 'Generate a prompt' })
    ).toHaveCount(0);

    // Teachers on a different assignment type do not get the generator option.
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/assignment-types/${e2eContext.assignmentTypeId}`);
    await page.getByRole('button', { name: /^New/ }).click();
    await expect(
      page.getByRole('menuitem', { name: 'Generate a prompt' })
    ).toHaveCount(0);
    await expect(
      page.getByRole('menuitem', { name: 'Assignment' })
    ).toBeVisible();
  });
});
