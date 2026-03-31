import { test, expect } from '../test-setup';
import type { Page } from '@playwright/test';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"], [data-testid="editor"]';

async function openEditor(page: Page, documentId: string) {
  await page.goto(`/app/documents/${documentId}`);
  await page.waitForLoadState('networkidle');
  const editor = page.locator(EDITOR_SELECTOR).first();
  await expect(editor).toBeVisible({ timeout: 15000 });
  return editor;
}

async function waitForSaveIndicator(page: Page) {
  // Wait for any save indicator to show "Saved" state
  // Handles both old ("Saved" pill) and new (SaveStatusIndicator) flows
  await expect(
    page.locator('text=Saved').first()
  ).toBeVisible({ timeout: 10000 });
}

function uniqueText(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe.serial('Document Regression Suite', () => {
  let documentId: string;

  test.beforeAll(async () => {
    // Will be set from e2eContext in each test
  });

  test('editor loads and displays content', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    documentId = e2eContext.documentId;
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, documentId);
    await expect(editor).toBeVisible();
  });

  test('typing text appears in editor and triggers save', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    const text = uniqueText('regression-type');
    await editor.pressSequentially(text, { delay: 30 });

    await expect(editor).toContainText(text);

    // Wait for save to complete
    await waitForSaveIndicator(page);
  });

  test('content persists after page reload', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    const text = uniqueText('regression-reload');
    await editor.pressSequentially(text, { delay: 30 });

    // Wait for save
    await waitForSaveIndicator(page);
    await page.waitForTimeout(2000);

    // Reload the page
    await page.reload();
    await page.waitForLoadState('networkidle');

    const editorAfterReload = page.locator(EDITOR_SELECTOR).first();
    await expect(editorAfterReload).toBeVisible({ timeout: 15000 });
    await expect(editorAfterReload).toContainText(text);
  });

  test('content persists after navigating away and back', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    const text = uniqueText('regression-navigate');
    await editor.pressSequentially(text, { delay: 30 });

    // Wait for save
    await waitForSaveIndicator(page);
    await page.waitForTimeout(2000);

    // Navigate away
    await page.goto('/app');
    await page.waitForLoadState('networkidle');

    // Navigate back
    const editorBack = await openEditor(page, e2eContext.documentId);
    await expect(editorBack).toContainText(text);
  });

  test('multiple rapid edits are not lost', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    // Type several distinct phrases rapidly
    const phrases = [
      uniqueText('rapid-1'),
      uniqueText('rapid-2'),
      uniqueText('rapid-3'),
    ];

    for (const phrase of phrases) {
      await editor.pressSequentially(phrase + ' ', { delay: 10 });
    }

    // Verify all phrases appear
    for (const phrase of phrases) {
      await expect(editor).toContainText(phrase);
    }

    // Wait for save and reload to verify persistence
    await waitForSaveIndicator(page);
    await page.waitForTimeout(2000);
    await page.reload();
    await page.waitForLoadState('networkidle');

    const editorAfter = page.locator(EDITOR_SELECTOR).first();
    await expect(editorAfter).toBeVisible({ timeout: 15000 });
    for (const phrase of phrases) {
      await expect(editorAfter).toContainText(phrase);
    }
  });

  test('Cmd/Ctrl+S triggers save', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    const text = uniqueText('regression-cmds');
    await editor.pressSequentially(text, { delay: 30 });

    // Trigger manual save
    const saveShortcut = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';
    await page.keyboard.press(saveShortcut);

    await waitForSaveIndicator(page);
  });

  test('document history sheet opens and shows tabs', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await openEditor(page, e2eContext.documentId);

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
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await openEditor(page, e2eContext.documentId);

    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Click Snapshots tab
    await sheet.locator('text=Snapshots').click();
    await page.waitForTimeout(1000);

    // Either we see snapshot entries or "no snapshots" — both are valid
    // Just verify the panel renders without errors
    await expect(sheet).toBeVisible();
  });

  test('document history shows autosave entries when available', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await openEditor(page, e2eContext.documentId);

    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Click Autosaves tab
    await sheet.locator('text=Autosaves').click();
    await page.waitForTimeout(1000);

    // Verify panel renders without errors
    await expect(sheet).toBeVisible();
  });

  test('selecting a history entry shows preview', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    // First type something to ensure there's at least one autosave
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();
    await editor.pressSequentially(uniqueText('history-preview'), { delay: 30 });
    await waitForSaveIndicator(page);
    await page.waitForTimeout(3000);

    // Open history sheet
    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Switch to Autosaves tab and check for entries
    await sheet.locator('text=Autosaves').click();
    await page.waitForTimeout(1500);

    // If there are version entries, click the first one
    const versionButton = sheet.locator('button').filter({ hasText: /\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}:\d{2}/ }).first();
    if (await versionButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await versionButton.click();
      // Preview panel should show content
      const previewPanel = sheet.locator('.font-times').first();
      await expect(previewPanel).toBeVisible({ timeout: 3000 });
    }
  });

  test('restore button exists in history sheet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await openEditor(page, e2eContext.documentId);

    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });

    // Verify restore button exists (even if broken, it should be present)
    const restoreButton = sheet.locator('button', { hasText: /restore/i });
    await expect(restoreButton.first()).toBeVisible({ timeout: 3000 });
  });

  test('editor remains functional after closing history sheet', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);

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
    await editor.click();
    const text = uniqueText('post-history');
    await editor.pressSequentially(text, { delay: 30 });
    await expect(editor).toContainText(text);
    await waitForSaveIndicator(page);
  });

  test('save indicator shows correct states', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    // Initially should show "Saved"
    await waitForSaveIndicator(page);

    // Type to trigger saving
    await editor.pressSequentially(uniqueText('indicator'), { delay: 30 });

    // Should eventually return to "Saved"
    await waitForSaveIndicator(page);
  });
});
