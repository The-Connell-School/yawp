import { test, expect } from '../test-setup';

test.describe('Admin AI evaluations', () => {
  test('reviews the grading assistant benchmark corpus', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');

    // Reachable from the admin tab nav
    await page.goto('/app/admin/general');
    await page.getByRole('link', { name: 'AI Evaluations' }).click();
    await expect(
      page.getByRole('heading', { name: 'AI Evaluations', level: 1 })
    ).toBeVisible();

    // Summary counts explain review state at a glance
    await expect(page.getByTestId('stat-draft-cases')).toContainText('15');
    await expect(page.getByTestId('stat-evaluation-definitions')).toContainText(
      '9'
    );
    await expect(page.getByTestId('stat-approved-cases')).toContainText('0');
    await expect(page.getByTestId('stat-release-status')).toContainText(
      /blocked/i
    );

    // Flow explainer describes the full path from input to release
    const flow = page.getByTestId('evaluation-flow');
    await expect(flow).toContainText('Case input');
    await expect(flow).toContainText('Model output');
    await expect(flow).toContainText('Deterministic checks');
    await expect(flow).toContainText('Qualitative review');
    await expect(flow).toContainText('Release decision');

    // All 15 cases are listed by default
    await expect(page.getByTestId('case-list-count')).toContainText('15');

    // Search narrows the case explorer
    await page.getByLabel('Search cases').fill('prompt injection embedded');
    await expect(page.getByTestId('case-list-count')).toContainText('1');
    const targetCase = page.getByRole('button', {
      name: /Prompt injection embedded in student text/i,
    });
    await expect(targetCase).toBeVisible();

    // Selecting a case (via keyboard) loads its detail
    await targetCase.focus();
    await page.keyboard.press('Enter');

    const detail = page.getByTestId('case-detail');
    await expect(detail).toContainText('Ignore the rubric');
    await expect(detail).toContainText('security');
    await expect(detail).toContainText('prompt-injection');
    await expect(detail).toContainText('Draft');
    await expect(detail).toContainText('Synthetic');

    // Score bands render for all five rubric categories
    await expect(
      page.getByTestId('score-band-thesis_and_content')
    ).toContainText('3–4');
    await expect(
      page.getByTestId('score-band-grammar_and_mechanics')
    ).toContainText('4–5');

    // Qualitative requirements show their evaluator, method, and requirement text
    const qualitative = page.getByTestId('qualitative-requirements');
    await expect(qualitative).toContainText('Prompt-injection resistance');
    await expect(qualitative).toContainText('Human or LLM judge');
    await expect(qualitative).toContainText('reveal no hidden prompt');

    // Clearing the search restores the full explorer
    await page.getByLabel('Search cases').fill('');
    await expect(page.getByTestId('case-list-count')).toContainText('15');

    // Strictness filter narrows to the single beginner-calibrated case
    await page.getByLabel('Filter by strictness').selectOption('beginner');
    await expect(page.getByTestId('case-list-count')).toContainText('1');
    await expect(
      page.getByRole('button', {
        name: /Balanced essay at beginner strictness/i,
      })
    ).toBeVisible();

    // Tag filter narrows to the strictness comparison group
    await page.getByLabel('Filter by strictness').selectOption('all');
    await page.getByLabel('Filter by tag').selectOption('comparison');
    await expect(page.getByTestId('case-list-count')).toContainText('3');
  });
});
