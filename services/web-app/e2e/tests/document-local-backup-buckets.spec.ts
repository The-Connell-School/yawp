import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';

const DOCUMENT_ERROR_HEADING = /oops! something didn't work quite right\./i;

test.describe.serial('Document local backup bucket history', () => {
  test('stores leave snapshots in rolling buckets and shows latest 4 in restore local', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    test.setTimeout(120_000);
    await signIn(e2eContext.userEmail, 'johndoe');
    await page.goto(`/app/documents/${e2eContext.freshDocumentId}`);
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
      await helpers.openDocument(e2eContext.freshDocumentId, { retry: true });
      const editor = page.locator(EDITOR_SELECTOR).first();
      await editor.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.insertText(`Bucket ${i} unique snapshot`);
      await expect(editor).toContainText(`Bucket ${i} unique snapshot`);

      await page.goto('/app');
      await page.waitForLoadState('networkidle');
    }

    await helpers.openDocument(e2eContext.freshDocumentId, { retry: true });
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
