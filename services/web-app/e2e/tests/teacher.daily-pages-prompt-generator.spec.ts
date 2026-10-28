import { test, expect } from '../test-setup';

const GENERATED_OPTIONS = [
  {
    prompt:
      'Choose one line from today’s reading and explain what it reveals about the narrator.',
    kind: 'close-read',
    sourceNeed: 'required',
    lengthTarget: 'paragraph',
    cognitiveMoves: ['interpret'],
  },
  {
    prompt:
      'Take a position on whether the character’s choice was justified, and defend it with one reason.',
    kind: 'claim-and-defend',
    sourceNeed: 'optional',
    lengthTarget: 'half-page',
    cognitiveMoves: ['argue-a-position'],
  },
  {
    prompt:
      'Name one difference between how the poem opens and how it ends, and say why it matters.',
    kind: 'one-difference',
    sourceNeed: 'none',
    lengthTarget: 'paragraph',
    cognitiveMoves: ['compare'],
  },
];

async function stubGenerator(page: import('@playwright/test').Page) {
  await page.route('**/api/domain/short-form-prompt-generator', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        reply: 'Here are three gradable Daily Pages angles.',
        options: GENERATED_OPTIONS,
      }),
    });
  });
}

test.describe.serial('Daily Pages prompt generator', () => {
  test('teacher sees Generate a prompt and can turn a draft into an assignment', async ({
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

    await page.getByRole('button', { name: /^New/ }).click();
    await page.getByRole('menuitem', { name: 'Generate a prompt' }).click();

    await expect(
      page.getByRole('heading', { name: 'Generate a prompt' })
    ).toBeVisible();

    await page
      .getByPlaceholder(
        "Describe the prompt you want or just say what you're teaching"
      )
      .fill('Something gradable after a close read');
    await page.getByRole('button', { name: 'Send' }).click();

    await expect(
      page.getByText('Here are three gradable Daily Pages angles')
    ).toBeVisible();
    await expect(page.getByText(GENERATED_OPTIONS[0].prompt)).toBeVisible();

    await page.getByRole('button', { name: 'Use this prompt' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Prompt' })).toHaveValue(
      GENERATED_OPTIONS[0].prompt
    );
  });
});
