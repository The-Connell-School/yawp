import { test, expect } from '../test-setup';
import type { Locator, Page } from '@playwright/test';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"], [data-testid="editor"]';
const DOCUMENT_ERROR_HEADING = /oops! something didn't work quite right\./i;

async function openDocumentEditorWithRetry(
  page: Page,
  documentId: string
): Promise<Locator> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`/app/documents/${documentId}`);
    await page.waitForLoadState('networkidle');

    const errorBoundaryHeading = page.getByRole('heading', {
      name: DOCUMENT_ERROR_HEADING,
    });
    const hitRouteError = await errorBoundaryHeading
      .isVisible({ timeout: 1500 })
      .catch(() => false);

    if (hitRouteError) {
      lastError = new Error('Document route rendered the general error boundary.');
    } else {
      const editor = page.locator(EDITOR_SELECTOR).first();
      try {
        await expect(editor).toBeVisible({ timeout: 10000 });
        return editor;
      } catch (error) {
        lastError = error;
      }
    }

    if (attempt === 0) {
      await page.waitForTimeout(500);
    }
  }

  throw lastError;
}

test.describe.serial('Document local backup bucket history', () => {
  test('stores leave snapshots in rolling buckets and shows latest 4 in restore local', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    test.setTimeout(120_000);
    await signIn('jdoe@brock.software', 'johndoe');
    await page.goto(`/app/documents/${e2eContext.editedDocumentId}`);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => {
      const backupPrefix = 'yawp:doc-backup:v1:';
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(backupPrefix)) keysToRemove.push(key);
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    });

    for (let i = 1; i <= 5; i++) {
      const editor = await openDocumentEditorWithRetry(page, e2eContext.editedDocumentId);
      await editor.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(`Bucket ${i} unique snapshot`);
      await expect(editor).toContainText(`Bucket ${i} unique snapshot`);

      await page.goto('/app');
      await page.waitForLoadState('networkidle');
    }

    await openDocumentEditorWithRetry(page, e2eContext.editedDocumentId);
    await page.getByRole('button', { name: /restore local/i }).click();
    await expect(
      page.getByRole('heading', { name: /restore local backup/i })
    ).toBeVisible();

    const entries = page.getByTestId('restore-local-entry');
    await expect(entries).toHaveCount(4);
    await expect(entries.nth(0)).toContainText('Bucket 5 unique snapshot');
    await expect(page.getByTestId('restore-local-list')).not.toContainText(
      'Bucket 1 unique snapshot'
    );
  });
});
