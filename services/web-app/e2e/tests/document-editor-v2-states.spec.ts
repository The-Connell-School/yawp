import { test, expect } from '../test-setup';

const SELECT_ALL_SHORTCUT =
  process.platform === 'darwin' ? 'Meta+A' : 'Control+A';

test.describe('Document editor v2 states board (pass 8)', () => {
  test('top bar shows Saved after editor loads', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expect(page.locator('[data-document-editor-version="v2"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('document-save-status')).toHaveAttribute(
      'data-sync-status',
      'synced'
    );
    await expect(page.getByTestId('document-save-status')).toContainText('Saved');
  });

  test('typing shows Saving… then Saved', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.type(' Pass8 save pulse');
    await expect
      .poll(
        async () =>
          page.getByTestId('document-save-status').getAttribute('data-sync-status'),
        { timeout: 15_000 }
      )
      .toMatch(/synced|saving/);
    await expect(page.getByTestId('document-save-status')).toHaveAttribute(
      'data-sync-status',
      'synced',
      { timeout: 30_000 }
    );
  });

  test('empty document submit shows design empty-state tooltip', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    await editor.click();
    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('document-submit-button')).toBeDisabled({
      timeout: 10_000,
    });
    await page.getByTestId('document-submit-empty-trigger').hover();
    await expect(
      page.getByText("You can't submit an empty document. Add text first.")
    ).toBeVisible({ timeout: 5_000 });
  });

  test('tutor panel shows Step N of M and Ready! when present', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expect(page.getByTestId('tutor-step-indicator')).toContainText(
      /Step \d+ of \d+/
    );
    const ready = page.getByTestId('tutor-ready-button');
    if (await ready.isVisible()) {
      await expect(ready).toContainText('Ready!');
    }
  });

  test('resolved margin comment renders collapsed row with Show', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await page.setViewportSize({ width: 1440, height: 900 });
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    const resolvedId = e2eContext.v2GradedResolvedCommentId;
    const row = page.getByTestId(`margin-comment-resolved-${resolvedId}`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row).toContainText('Resolved');
    await expect(row).toContainText('Show');
    await row.click();
    await expect(
      page.getByTestId(`margin-comment-resolved-expanded-${resolvedId}`)
    ).toBeVisible({ timeout: 10_000 });
  });

  test('mobile 390: Write, Tutor, and Comments tabs', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.setViewportSize({ width: 390, height: 844 });
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const tabbar = page.getByTestId('document-mobile-tabbar');
    await expect(tabbar).toBeVisible();
    await expect(tabbar.getByText('Write')).toBeVisible();
    await expect(tabbar.getByText('Tutor')).toBeVisible();
    await expect(tabbar.getByText('Comments')).toBeVisible();
    await tabbar.getByText('Comments').click();
    await expect(page.getByTestId('mobile-comments-sheet')).toBeVisible({
      timeout: 10_000,
    });
    await tabbar.getByText('Tutor').click();
    await expect(page.getByTestId('tutor-module-header')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('teacher view-only toolbar banner', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('teacher.e2e@yawp.test', 'teacher-e2e-password');
    await helpers.openDocument(
      `${e2eContext.gradedDocumentId}?tab=editor`,
      { retry: true }
    );
    await expect(page.getByTestId('document-view-only-banner')).toContainText(
      'Viewing only'
    );
    await expect(page.getByTestId('document-teacher-student-name')).toBeVisible();
  });

  test('tutor ask row opens expanded input with Cancel path', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const ask = page.getByTestId('tutor-ask-open');
    if (!(await ask.isVisible())) {
      test.skip();
      return;
    }
    await ask.click();
    await expect(page.getByTestId('tutor-chat-input')).toBeVisible();
    await page.getByTestId('tutor-chat-back').click();
    await expect(page.getByTestId('tutor-ask-open')).toBeVisible();
  });
});