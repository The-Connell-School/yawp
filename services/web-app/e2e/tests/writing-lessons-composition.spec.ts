import { test, expect } from '../test-setup';

// The Composition strand of Writing Fundamentals Practice is constructed
// response, not ACT multiple choice: the student writes a topic sentence /
// thesis and the tutor feedback service responds. E2E runs offline (no
// ANTHROPIC_API_KEY), so the feedback service degrades to its deterministic
// self-check — which is exactly what we assert here.
test.describe.serial('Writing Fundamentals Practice — Composition', () => {
  test('surfaces a Composition section on the practice index', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing fundamentals practice/i })
    ).toBeVisible();

    // The two strands each get their own heading.
    await expect(
      page.getByRole('heading', { name: 'Grammar & Mechanics' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Composition' })
    ).toBeVisible();

    // Sections are collapsed by default; open Composition to reveal its lessons.
    await page.getByRole('button', { name: 'Composition' }).click();

    // Composition links through to the constructed-response lessons, grouped
    // into Making Claims (topic sentences, thesis) and Supporting Claims
    // (evidence, analysis).
    await expect(
      page.getByRole('link', { name: /topic sentences/i })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /evidence/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /analysis/i })).toBeVisible();
    await page.getByRole('link', { name: /thesis statements/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Thesis Statements' })
    ).toBeVisible();
  });

  test('keeps Composition lessons out of the ACT session builder', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await page.getByRole('button', { name: /create practice/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText(/skills to practice/i)).toBeVisible();

    // The self-directed session is ACT multiple choice only, so composition
    // skills must not be selectable there.
    await expect(
      dialog.getByText('Fixing Comma Splices', { exact: true })
    ).toBeVisible();
    await expect(
      dialog.getByText('Topic Sentences', { exact: true })
    ).toHaveCount(0);
    await expect(
      dialog.getByText('Thesis Statements', { exact: true })
    ).toHaveCount(0);
  });

  test('lets a student make the practice about their own interest', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/topic-sentences');

    const panel = page.getByRole('complementary');
    await expect(panel.getByTestId('composition-topic-picker')).toBeVisible();

    // Name a topic. E2E runs offline (no ANTHROPIC_API_KEY), so AI generation
    // degrades to the deterministic topic templates — choice still works.
    await panel.getByTestId('composition-topic-input').fill('skateboarding');
    await panel.getByRole('button', { name: /make it mine/i }).click();

    const activeTopic = panel.getByTestId('composition-topic-active');
    await expect(activeTopic).toBeVisible();
    await expect(activeTopic).toContainText('skateboarding');
    // The prompt itself is now built around the student's interest.
    await expect(
      panel.getByText(/one opinion you hold about skateboarding/i)
    ).toBeVisible();

    // And they can drop back to the standard prompts at any time.
    await panel.getByRole('button', { name: /use standard prompts/i }).click();
    await expect(panel.getByTestId('composition-topic-picker')).toBeVisible();
    await expect(
      panel.getByText(/one opinion you hold about skateboarding/i)
    ).toHaveCount(0);
  });

  test('lets a student write a topic sentence and get tutor feedback', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons/topic-sentences');

    await expect(
      page.getByRole('heading', { name: 'Topic Sentences' })
    ).toBeVisible();

    const panel = page.getByRole('complementary');
    await expect(panel.getByText(/try it yourself/i)).toBeVisible();
    // Constructed response, not multiple choice: there is a writing box and no
    // ACT answer choices.
    await expect(panel.getByText(/choose the best answer/i)).toHaveCount(0);
    const response = panel.getByTestId('composition-response');
    await expect(response).toBeVisible();

    // A guardrail catches a blank submission before it ever reaches the tutor.
    await panel.getByRole('button', { name: /check my answer/i }).click();
    const result = page.getByTestId('composition-result');
    await expect(result).toBeVisible();
    await expect(result).toContainText(/add your revision/i);

    // A real attempt gets real (here, offline-degraded) tutor feedback.
    await response.fill(
      'The cafeteria menu punishes the students who most need a real lunch.'
    );
    await panel.getByRole('button', { name: /check my answer/i }).click();
    await expect(result).toBeVisible();
    await expect(result).toContainText(/tutor is offline/i);

    // The student can move on to a fresh prompt without dead-ending.
    await panel.getByRole('button', { name: /new prompt/i }).click();
    await expect(page.getByTestId('composition-result')).toHaveCount(0);
    await expect(panel.getByTestId('composition-response')).toHaveValue('');
  });
});
