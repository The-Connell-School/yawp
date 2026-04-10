import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';
import { createE2EPrismaClient } from '../prisma-client';
import { invalidateUserSessions } from '../db-helpers';

const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';

async function expectExitControlVisible(page: import('@playwright/test').Page) {
  const exitButton = page.getByRole('button', { name: /^exit$/i });
  if ((await exitButton.count()) > 0) {
    await expect(exitButton.first()).toBeVisible({ timeout: 10000 });
    return;
  }

  await expect(page.getByRole('link', { name: /^exit$/i }).first()).toBeVisible({
    timeout: 10000,
  });
}

test.describe.serial('Document Editor E2E Tests', () => {
  test('should display basic document page structure', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    // Navigate to a seeded document and allow one retry for transient route errors.
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Check that basic page structure is present
    await expectExitControlVisible(page);
    await expect(editor).toBeVisible({ timeout: 10000 });
  });

  test('should allow typing in document editor with simulated saving', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    let saveRequestCount = 0;

    // Intercept document save APIs to track save operations but allow real saves
    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() === 'PUT') {
        saveRequestCount++;
      }
      await route.continue();
    });
    await page.route('**/api/document/*/save', async (route) => {
      if (route.request().method() === 'POST') {
        saveRequestCount++;
      }
      await route.continue();
    });

    await helpers.openDocument(e2eContext.freshDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Type some content
    const testText = 'This is test content for e2e testing!';
    await helpers.typeInEditor(testText);

    // Verify the text appears in the editor
    await expect(editor).toContainText(testText);

    // Wait for auto-save to complete (SyncService uses a 2s debounce)
    await helpers.waitForSaved();

    // Check that a save request was made
    expect(saveRequestCount).toBeGreaterThan(0);

    // Verify content persisted by reloading the page
    await helpers.verifyPersistsOnReload(testText);
  });

  test('should handle pasting content in document editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.freshDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Simulate pasting content by inserting text directly
    const pasteContent = 'This content was pasted into the editor.';
    await editor.click();
    await page.keyboard.insertText(pasteContent);

    // Verify pasted content appears
    await expect(editor).toContainText(pasteContent);

    // Wait for auto-save then verify persistence
    await helpers.waitForSaved();
    await helpers.verifyPersistsOnReload(pasteContent);
  });

  test('should handle multiple rapid edits without data loss', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.freshDocumentId, { retry: true });
    const editor = helpers.getEditor();

    // Rapid typing simulation
    const words = ['Rapid', 'typing', 'test', 'with', 'multiple', 'words'];
    for (const word of words) {
      await editor.pressSequentially(`${word} `, { delay: 50 });
    }

    // Wait for debounced save to complete
    await helpers.waitForSaved();

    // Verify all content is present
    for (const word of words) {
      await expect(editor).toContainText(word);
    }

    // Verify content actually persisted to the server (the real test — no data loss)
    await helpers.verifyPersistsOnReload(words[0]);
  });

  test('does not allow an older delayed save to overwrite newer content', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    let firstSaveRoute: Parameters<Parameters<typeof page.route>[1]>[0] | null = null;
    let firstSaveReleased = false;
    let seenSaveCount = 0;

    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() !== 'PUT') {
        await route.continue();
        return;
      }

      seenSaveCount += 1;
      if (seenSaveCount === 1) {
        firstSaveRoute = route;
        return;
      }

      await route.continue();
      if (firstSaveRoute && !firstSaveReleased) {
        firstSaveReleased = true;
        await page.waitForTimeout(800); // brief hold to simulate out-of-order network response
        await firstSaveRoute.continue();
      }
    });

    await editor.click();
    await editor.pressSequentially(' older');
    await page.waitForTimeout(1700); // allow first debounce to fire
    await editor.pressSequentially(' newest');
    await helpers.waitForSaved();

    await helpers.verifyPersistsOnReload('newest');
  });

  test('updating the title does not overwrite newer editor content', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();

    await editor.click();
    const appendedText = ' Content that should survive a title edit.';
    await editor.pressSequentially(appendedText);

    const titleInput = page.getByPlaceholder('Untitled document');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('Updated E2E Title');
    await titleInput.blur();

    await helpers.waitForSaved();

    await helpers.verifyPersistsOnReload(appendedText.trim());
  });

  test('locks editor and shows session modal when autosave gets auth failure', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
      const editor = helpers.getEditor();

      await helpers.typeInEditor('Baseline text before session expiry.');
      await helpers.waitForSaved();

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await editor.click();
      await editor.pressSequentially(' This text should trigger auth failure lock.');
      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect
        .poll(
          async () => page.locator(EDITOR_SELECTOR).first().getAttribute('contenteditable'),
          { timeout: 5000 }
        )
        .toBe('false');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('locks editor on focus auth check after session expires in background', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
      const editor = helpers.getEditor();
      await expect(editor).toBeVisible({ timeout: 10000 });

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect
        .poll(
          async () => page.locator(EDITOR_SELECTOR).first().getAttribute('contenteditable'),
          { timeout: 5000 }
        )
        .toBe('false');
    } finally {
      await prisma.$disconnect();
    }
  });

  test('blocks tutor actions when session is locked', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

      let tutorRequests = 0;
      await page.route('**/api/domain/tutor-response', async (route) => {
        if (route.request().method() === 'POST') tutorRequests += 1;
        await route.continue();
      });

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
      });

      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect(page.getByTestId('tutor-chat-open')).toBeDisabled();
      await expect.poll(() => tutorRequests).toBe(0);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('posts paste-alert when pasting large text not copied from editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    const longText = 'x'.repeat(201);

    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, longText);

    await editor.click();

    const pasteAlertPromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/paste-alert') && req.method() === 'POST',
      { timeout: 15000 }
    );

    await page.keyboard.press(PASTE_SHORTCUT);
    await pasteAlertPromise;
  });

  test('does not post paste-alert when pasting large text copied from same editor', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = helpers.getEditor();
    const longText = 'y'.repeat(201);

    await editor.click();
    await page.keyboard.insertText(longText);
    await expect(editor).toContainText(longText);

    await page.keyboard.press(SELECT_ALL_SHORTCUT);
    await page.keyboard.press(COPY_SHORTCUT);

    let pasteAlertCount = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/paste-alert') && req.method() === 'POST') {
        pasteAlertCount++;
      }
    });

    await page.keyboard.press(PASTE_SHORTCUT);
    // Brief pause for any in-flight paste-alert requests to arrive before asserting zero
    await page.waitForTimeout(500);

    expect(pasteAlertCount).toBe(0);
  });
});
