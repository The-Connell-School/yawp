import { test, expect } from '../test-setup';
import { TestHelpers } from '../test-helpers';

const EDITOR_SELECTOR = '.ProseMirror';

test.describe('Document Save Log tab', () => {
  test('should display journal entries in the Save Log tab', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    // 1. Sign in as the student
    await signIn(e2eContext.userEmail, 'e2e-password');

    // 2. Navigate to the document
    await page.goto(`/app/documents/${e2eContext.documentId}`);
    await page.waitForLoadState('networkidle');

    // 3. Wait for the editor to be ready
    const editor = page.locator(EDITOR_SELECTOR).first();
    await expect(editor).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // 4. Type some text in the editor to trigger autosaves (which create DocumentWriteJournal entries)
    await editor.click();
    const testText = `Save log test ${Date.now()}`;
    await editor.type(testText);

    // 5. Wait for the save to complete
    const helpers = new TestHelpers(page);
    await helpers.waitForSave();

    // 6. Open the history sheet by clicking the history icon
    const historyIcon = page.locator('svg.lucide-history').first();
    await expect(historyIcon).toBeVisible({ timeout: 5000 });
    await historyIcon.click();

    // Verify the sheet opened
    await expect(page.getByText('Version History')).toBeVisible({
      timeout: 5000,
    });

    // 7. Click the "Save Log" tab button
    const saveLogTab = page.getByRole('button', { name: 'Save Log' });
    await expect(saveLogTab).toBeVisible({ timeout: 5000 });
    await saveLogTab.click();

    // 8. Verify that at least one journal entry is visible with status badges
    // Journal entries should show operation type (e.g. "Save") and status (e.g. "accepted")
    const journalEntries = page.locator('[data-testid="journal-entry"]');
    await expect(journalEntries.first()).toBeVisible({ timeout: 10000 });
    const entryCount = await journalEntries.count();
    expect(entryCount).toBeGreaterThan(0);

    // Verify badges are present on entries (operation type or status indicators)
    const badges = page.locator(
      '[data-testid="journal-entry"] >> text=/Save|accepted|rejected/i'
    );
    await expect(badges.first()).toBeVisible({ timeout: 5000 });

    // 9. Click on an entry to verify the preview panel shows content
    await journalEntries.first().click();
    const previewPanel = page.locator('[data-testid="journal-preview"]');
    await expect(previewPanel).toBeVisible({ timeout: 5000 });
    // The preview should contain some HTML content from the journal entry
    const previewContent = await previewPanel.textContent();
    expect(previewContent).toBeTruthy();
  });

  test('should allow restoring a journal entry', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    // Sign in as the student
    await signIn(e2eContext.userEmail, 'e2e-password');

    // Navigate to the document
    await page.goto(`/app/documents/${e2eContext.documentId}`);
    await page.waitForLoadState('networkidle');

    // Wait for the editor to be ready
    const editor = page.locator(EDITOR_SELECTOR).first();
    await expect(editor).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Type some text to generate journal entries
    await editor.click();
    const restoreText = `Restore test ${Date.now()}`;
    await editor.type(restoreText);

    // Wait for save
    const helpers = new TestHelpers(page);
    await helpers.waitForSave();

    // Open the history sheet
    const historyIcon = page.locator('svg.lucide-history').first();
    await historyIcon.click();
    await expect(page.getByText('Version History')).toBeVisible({
      timeout: 5000,
    });

    // Switch to Save Log tab
    const saveLogTab = page.getByRole('button', { name: 'Save Log' });
    await expect(saveLogTab).toBeVisible({ timeout: 5000 });
    await saveLogTab.click();

    // Wait for entries to load and select the first one
    const journalEntries = page.locator('[data-testid="journal-entry"]');
    await expect(journalEntries.first()).toBeVisible({ timeout: 10000 });
    await journalEntries.first().click();

    // Click the restore button
    const restoreButton = page.getByRole('button', {
      name: /Restore and Reload/i,
    });
    await expect(restoreButton).toBeEnabled({ timeout: 5000 });
    await restoreButton.click();

    // After restore, page should reload - wait for the editor to reappear
    await page.waitForLoadState('networkidle');
    await expect(page.locator(EDITOR_SELECTOR).first()).toBeVisible({
      timeout: 15000,
    });
  });
});
