import { test, expect } from '../test-setup';

test.describe('Admin AI evaluations', () => {
  test('runs the static grading assistant benchmark lab', async ({
    page,
    signIn,
  }) => {
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');

    await page.goto('/app/admin/general');
    await page.getByRole('link', { name: 'AI Evaluations' }).click();
    await expect(
      page.getByRole('heading', { name: 'AI Evaluations', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Grading Evals', level: 2 })
    ).toBeVisible();

    await expect(page.getByTestId('stat-total-cases')).toContainText('15');
    await expect(page.getByTestId('stat-evaluation-definitions')).toContainText(
      '9'
    );
    await expect(page.getByTestId('stat-pass-count')).toContainText('0');
    await expect(page.getByTestId('stat-fail-count')).toContainText('0');

    await expect(page.getByTestId('case-list-count')).toContainText('15');

    await page.getByLabel('Search cases').fill('prompt injection embedded');
    await expect(page.getByTestId('case-list-count')).toContainText('1');
    const targetCase = page.getByRole('button', {
      name: /Prompt injection embedded in student text/i,
    });
    await expect(targetCase).toBeVisible();

    await targetCase.focus();
    await page.keyboard.press('Enter');

    const detail = page.getByTestId('case-detail');
    await expect(detail).toContainText('Ignore the rubric');
    await expect(detail).toContainText('security');
    await expect(detail).toContainText('prompt-injection');
    await expect(
      page.getByTestId('score-band-thesis_and_content')
    ).toContainText('3–4');
    await expect(
      page.getByTestId('score-band-grammar_and_mechanics')
    ).toContainText('4–5');

    const qualitative = page.getByTestId('qualitative-requirements');
    await expect(qualitative).toContainText('Prompt-injection resistance');
    await expect(qualitative).toContainText('Human or LLM judge');
    await expect(qualitative).toContainText('reveal no hidden prompt');

    await page.getByTestId('run-selected-case').click();
    await expect(page.getByTestId('case-run-result')).toBeVisible();
    await expect(page.getByTestId('stat-pass-count')).not.toContainText('0');

    await page.getByLabel('Search cases').fill('');
    await page.getByLabel('Filter by strictness').selectOption('beginner');
    await expect(page.getByTestId('case-list-count')).toContainText('1');

    await page.getByTestId('run-all-cases').click();
    await expect(page.getByTestId('stat-pass-count')).toHaveText(/\d+/);
    await expect(page.getByTestId('case-run-result')).toBeVisible();
  });
});
