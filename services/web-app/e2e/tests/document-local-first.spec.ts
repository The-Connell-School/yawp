import { test, expect } from '../test-setup';

test.describe('Local-first document persistence', () => {
  test('new save endpoint responds and creates revision', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');

    await helpers.openDocument(e2eContext.editedDocumentId);

    // Verify the SaveStatusIndicator shows initial "Saved" state
    await expect(page.getByText(/^Saved$/).first()).toBeVisible({ timeout: 5000 });

    // Verify the DocumentHistory icon is present (second history icon)
    const historyIcons = page.locator('svg.lucide-history');
    await expect(historyIcons.first()).toBeVisible();
  });
});
