import { test, expect } from '../test-setup';

test.describe.serial('Writing practice prototype', () => {
  test('keeps writing practice off the student dashboard', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await expect(
      page.getByRole('link', { name: /writing practice/i })
    ).toHaveCount(0);
  });

  test('loads lessons by direct URL and supports a self-guided practice check', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto('/app/writing-lessons');

    await expect(
      page.getByRole('heading', { name: /writing practice/i })
    ).toBeVisible();
    await expect(page.getByText(/self-guided practice/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /revising for wordiness/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /comma splices/i })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /pronoun agreement/i })
    ).toBeVisible();

    await page.getByRole('link', { name: /revising for wordiness/i }).click();

    await expect(
      page.getByRole('heading', { name: 'Revising for Wordiness' })
    ).toBeVisible();
    await expect(page.getByText(/practice prompt/i)).toBeVisible();
    await expect(
      page.getByRole('complementary').getByText('At this point in time')
    ).toBeVisible();

    await page
      .getByLabel(/your practice response/i)
      .fill('We cannot accept new applications now.');
    await page.getByRole('button', { name: /check response/i }).click();

    // Feedback is returned by the practice-feedback service. In E2E there is no
    // ANTHROPIC_API_KEY, so it uses the deterministic degraded fallback, which
    // still grounds its guidance in the lesson's skill.
    const feedback = page.getByTestId('practice-feedback');
    await expect(feedback).toBeVisible();
    await expect(feedback.getByText(/coming along/i)).toBeVisible();
    await expect(feedback.getByText(/revising for wordiness/i)).toBeVisible();
    await expect(feedback.getByText(/tutor offline/i)).toBeVisible();

    // Switching prompts clears the previous feedback.
    await page.getByRole('button', { name: /try another prompt/i }).click();
    await expect(page.getByTestId('practice-feedback')).toHaveCount(0);
    await expect(
      page.getByRole('complementary').getByText(/weak construction/i)
    ).toBeVisible();
  });

  test('lets a teacher assign a lesson to one of their classes', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await setWritingPracticeForOrganization({
      organizationId: e2eContext.organizationId,
      enabled: true,
    });

    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/writing-lessons/fixing-comma-splices');

    // Teachers get the assign panel instead of the student practice panel.
    const assignPanel = page.getByRole('complementary');
    await expect(
      assignPanel.getByRole('heading', { name: /assign to your classes/i })
    ).toBeVisible();
    await expect(page.getByTestId('practice-feedback')).toHaveCount(0);

    const classCheckbox = page.locator('input[name="classIds"]').first();
    await classCheckbox.check();
    await page.locator('input[name="problemCount"]').fill('4');
    await page.getByRole('button', { name: /assign practice/i }).click();

    await expect(page.getByTestId('assign-result')).toContainText(
      /assigned to 1 class/i
    );
  });
});
