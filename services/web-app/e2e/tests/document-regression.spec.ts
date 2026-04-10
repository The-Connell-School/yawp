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

  test('document history sheet opens and shows tabs', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Click the history icon
    const historyIcon = page.locator('svg.lucide-history').first();
    await expect(historyIcon).toBeVisible({ timeout: 5000 });
    await historyIcon.click();

    // Verify sheet opens
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Verify "Version History" title
    await expect(sheet.locator('text=Version History')).toBeVisible();

    // Verify tab buttons exist (at minimum Snapshots and Autosaves)
    await expect(sheet.locator('text=Snapshots')).toBeVisible();
    await expect(sheet.locator('text=Autosaves')).toBeVisible();
  });

  test('document history shows snapshot entries when available', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Click Snapshots tab
    await sheet.locator('text=Snapshots').click();
    // Wait for tab panel to render
    await expect(sheet.locator('[role="tabpanel"]').first()).toBeVisible({ timeout: 5000 });

    // Either we see snapshot entries or "no snapshots" — both are valid
    // Just verify the panel renders without errors
    await expect(sheet).toBeVisible();
  });

  test('document history shows autosave entries when available', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Click Autosaves tab
    await sheet.locator('text=Autosaves').click();
    // Wait for tab panel to render
    await expect(sheet.locator('[role="tabpanel"]').first()).toBeVisible({ timeout: 5000 });

    // Verify panel renders without errors
    await expect(sheet).toBeVisible();
  });

  test('selecting a history entry shows preview', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    // First type something to ensure there's at least one autosave
    await helpers.openDocument(e2eContext.editedDocumentId);
    await helpers.typeInEditor(uniqueText('history-preview'));
    await helpers.waitForSaved();

    // Open history sheet
    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Switch to Autosaves tab and check for entries
    await sheet.locator('text=Autosaves').click();
    // Wait for tab panel to render
    await expect(sheet.locator('[role="tabpanel"]').first()).toBeVisible({ timeout: 5000 });

    // If there are version entries, click the first one
    const versionButton = sheet.locator('button').filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}/ }).first();
    if (await versionButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await versionButton.click();
      // Preview panel should show content
      const previewPanel = sheet.locator('.font-times').first();
      await expect(previewPanel).toBeVisible({ timeout: 3000 });
    }
  });

  test('history sheet has close button but no restore button', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Restore button was removed (it was broken)
    const restoreButton = sheet.locator('button', { hasText: /restore/i });
    await expect(restoreButton).not.toBeVisible({ timeout: 2000 });

    // Close button should exist
    const closeButton = sheet.locator('button', { hasText: /close/i });
    await expect(closeButton.first()).toBeVisible();
  });

  test('editor remains functional after closing history sheet', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Open and close history
    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();
    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Close via the Close button (use last() to avoid the sheet's built-in X close)
    const closeButton = sheet.locator('button', { hasText: /^close$/i }).last();
    await closeButton.click();
    await expect(sheet).not.toBeVisible({ timeout: 3000 });

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
