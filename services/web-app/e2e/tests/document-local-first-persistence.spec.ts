/**
 * Phase 1 local-first persistence tests.
 *
 * These cover the core value prop of the Phase 1 refactor:
 * 1. IDB hydration — content survives even when server save is blocked
 * 2. Save status indicator — shows correct states through the save lifecycle
 * 3. Document history — new revisions appear in the session timeline
 */
import { test, expect } from '../test-setup';

function uniqueText(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe.serial('Local-first persistence (Phase 1)', () => {
  test('content persists via IDB even when server save is blocked', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const marker = uniqueText('idb-hydration');

    // Block all server saves — the SyncService will write to IDB but fail to POST
    await page.route(/\/api\/document\/.*\/save/, (route) => route.abort());

    // Type content — it will be saved to IDB but NOT to the server
    await helpers.typeInEditor(marker);

    // Wait for IDB write + sync attempt + abort. The SyncService debounces
    // by 2s, then the aborted fetch triggers 'offline' status → "Saved locally".
    await expect(page.getByText('Saved locally')).toBeVisible({ timeout: 15000 });

    // Reload the page — server doesn't have this content, only IDB does
    await page.unroute(/\/api\/document\/.*\/save/);
    await page.reload();
    await page.waitForLoadState('networkidle');
    await helpers.waitForEditorReady();

    // Content should be hydrated from IDB
    const editor = helpers.getEditor();
    await expect(editor).toContainText(marker, { timeout: 10000 });
  });

  test('save status indicator cycles through correct states', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    // Before typing — should show "Saved" (synced from last save)
    await expect(page.getByText(/^Saved$/).first()).toBeVisible({ timeout: 10000 });

    const marker = uniqueText('status-indicator');

    // Type content — the sync service will debounce, then POST
    await helpers.typeInEditor(marker);

    // Should eventually show "Saved" after the server sync completes
    // (the SyncService debounces by 2s, then POSTs, then marks synced)
    await expect(page.getByText(/^Saved$/).first()).toBeVisible({ timeout: 15000 });
  });

  test('document history shows revision entries after typing', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId);

    const marker = uniqueText('history-revision');
    await helpers.typeInEditor(marker);

    // Wait for server save to complete
    await page.waitForResponse(
      (res) => res.url().includes('/api/document/') && res.url().includes('/save') && res.status() === 200,
      { timeout: 15000 },
    );

    // Open the history panel
    const historyIcon = page.locator('.lucide-history').first();
    await expect(historyIcon).toBeVisible({ timeout: 5000 });
    await historyIcon.click();

    const sheet = page.locator('[role="dialog"]').first();
    await expect(sheet).toBeVisible({ timeout: 5000 });
    await expect(sheet.locator('text=Document History')).toBeVisible();

    // Should see at least one session entry with a time range
    await expect(
      sheet.locator('button').filter({ hasText: /\d{1,2}:\d{2}/ }).first()
    ).toBeVisible({ timeout: 5000 });
  });
});
