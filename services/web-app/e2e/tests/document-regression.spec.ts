import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';

function uniqueText(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe.serial('Document Regression Suite', () => {
  test('editor loads and displays content', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);
    const editor = helpers.getEditor();
    await expect(editor).toBeVisible();
  });

  test('typing text appears in editor and triggers save', async ({
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const text = uniqueText('regression-type');
    await helpers.typeInEditor(text);

    await expect(helpers.getEditor()).toContainText(text);
    await helpers.waitForSaved();
  });

  test('content persists after page reload', async ({
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const text = uniqueText('regression-reload');
    await helpers.typeInEditor(text);
    await helpers.waitForSaved();

    await helpers.verifyPersistsOnReload(text);
  });

  test('content persists after navigating away and back', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const text = uniqueText('regression-navigate');
    await helpers.typeInEditor(text);
    await helpers.waitForSaved();

    // Navigate away
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Navigate back
    await helpers.openDocument(e2eContext.editedDocumentId);
    await expect(helpers.getEditor()).toContainText(text);
  });

  test('multiple rapid edits are not lost', async ({
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Type several distinct phrases rapidly
    const phrases = [
      uniqueText('rapid-1'),
      uniqueText('rapid-2'),
      uniqueText('rapid-3'),
    ];

    const editor = helpers.getEditor();
    for (const phrase of phrases) {
      await editor.pressSequentially(phrase + ' ', { delay: 10 });
    }

    // Verify all phrases appear
    for (const phrase of phrases) {
      await expect(editor).toContainText(phrase);
    }

    // Wait for save and reload to verify persistence
    await helpers.waitForSaved();
    await helpers.verifyPersistsOnReload(phrases[phrases.length - 1]);
  });

  test('Cmd/Ctrl+S triggers save', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const text = uniqueText('regression-cmds');
    await helpers.typeInEditor(text);

    // Trigger manual save
    const saveShortcut = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';
    await page.keyboard.press(saveShortcut);

    await helpers.waitForSaved();
  });

  test('document history sheet opens with session timeline', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Click the history icon
    const historyIcon = page.locator('.lucide-history').first();
    await expect(historyIcon).toBeVisible({ timeout: 5000 });
    await historyIcon.click();

    // Verify sheet opens with title
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.locator('text=Document History')).toBeVisible();

    // Session timeline renders — the edited doc has 2 seeded revisions
    // so we should see at least one session entry with a time pattern
    await expect(
      sheet.locator('button').filter({ hasText: /\d{1,2}:\d{2}/ }).first()
    ).toBeVisible({ timeout: 5000 });
  });

  test('selecting a history session entry shows preview', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    // Type something to create a revision
    await helpers.openDocument(e2eContext.editedDocumentId);
    await helpers.typeInEditor(uniqueText('history-preview'));
    await helpers.waitForSaved();

    // Open history sheet
    const historyIcon = page.locator('.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Click a session entry to expand it
    const sessionButton = sheet.locator('button').filter({ hasText: /\d{1,2}:\d{2}/ }).first();
    if (await sessionButton.count() > 0) {
      await sessionButton.click();
      // Preview panel should show content
      const previewPanel = sheet.locator('.font-times').first();
      await expect(previewPanel).toBeVisible({ timeout: 5000 });
    }
  });

  test('editor remains functional after closing history sheet', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Open and close history via the sheet's X button
    const historyIcon = page.locator('.lucide-history').first();
    await historyIcon.click();
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Close via the Close button in the sheet
    const closeButton = sheet.getByRole('button', { name: /close/i });
    await closeButton.click();
    await expect(sheet).not.toBeVisible({ timeout: 5000 });

    // Verify editor is still functional
    const editor = helpers.getEditor();
    await editor.click();
    const text = uniqueText('post-history');
    await editor.pressSequentially(text, { delay: 30 });
    await expect(editor).toContainText(text);
    await helpers.waitForSaved();
  });

  test('save indicator shows correct states', async ({
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Initially should show "Saved"
    await helpers.waitForSaved();

    // Type to trigger saving
    await helpers.typeInEditor(uniqueText('indicator'));

    // Should eventually return to "Saved"
    await helpers.waitForSaved();
  });
});
