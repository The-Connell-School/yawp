import { test, expect } from '../test-setup';
import { TestHelpers } from '../test-helpers';
import type { Page } from '@playwright/test';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"], [data-testid="editor"]';
const DOCUMENT_ERROR_HEADING = /oops! something didn't work quite right\./i;
const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';

async function openDocumentEditorWithRetry(page: Page, documentId: string) {
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

async function expectExitControlVisible(page: Page) {
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
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    // Navigate to a seeded document and allow one retry for transient route errors.
    const editorContainer = await openDocumentEditorWithRetry(
      page,
      e2eContext.documentId
    );

    // Check that basic page structure is present
    await expectExitControlVisible(page);
    await expect(editorContainer).toBeVisible({ timeout: 10000 });
  });

  test('should allow typing in document editor with simulated saving', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    test.setTimeout(60_000);
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);

    // Click on the editor to focus it
    await editor.click();

    // Type some content
    const testText = 'This is test content for e2e testing!';
    await editor.type(testText);

    // Verify the text appears in the editor
    await expect(editor).toContainText(testText);

    // Wait for sync to complete (IndexedDB write is instant, server sync is debounced 2s)
    await page.waitForTimeout(5000);

    // Verify persisted content by exiting and returning (with reload fallback)
    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: testText,
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('should handle pasting content in document editor', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();

    // Simulate pasting content
    const pasteContent = 'This content was pasted into the editor.';

    // Insert text to simulate paste without requiring clipboard permissions
    await page.keyboard.insertText(pasteContent);

    // Verify pasted content appears
    await expect(editor).toContainText(pasteContent);

    // Verify persisted content
    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: pasteContent,
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('should demonstrate document version concept', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();

    // Add content — revisions are created server-side during save
    await editor.type('Content that should create a version.');

    // Wait for auto-save (SyncService debounce is 2s)
    await page.waitForTimeout(4000);

    // Verify editor functionality works
    await expect(editor).toContainText('Content that should create a version.');
  });

  test('should handle multiple rapid edits without data loss', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();

    // Rapid typing simulation
    const words = ['Rapid', 'typing', 'test', 'with', 'multiple', 'words'];
    for (const word of words) {
      await editor.type(`${word} `, { delay: 100 }); // Fast typing
    }

    // Verify all content is present
    for (const word of words) {
      await expect(editor).toContainText(word);
    }

    // Wait for save to complete
    await expect(page.getByText('Saved')).toBeVisible({ timeout: 10000 });

    // Verify persisted content
    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: words,
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('does not allow an older delayed save to overwrite newer content', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();

    let firstSaveRoute: Parameters<Parameters<typeof page.route>[1]>[0] | null = null;
    let firstSaveReleased = false;
    let seenSaveCount = 0;

    await page.route('**/api/document/*/save', async (route) => {
      if (route.request().method() !== 'POST') {
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
        await page.waitForTimeout(800);
        await firstSaveRoute.continue();
      }
    });

    await editor.type(' older');
    await page.waitForTimeout(1700);
    await editor.type(' newest');
    await page.waitForTimeout(2500);

    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: 'newest',
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('updating the title does not overwrite newer editor content', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();
    const appendedText = ' Content that should survive a title edit.';
    await editor.type(appendedText);
    await page.waitForTimeout(2000);

    const titleInput = page.getByPlaceholder('Untitled document');
    await expect(titleInput).toBeVisible({ timeout: 10000 });
    await titleInput.fill('Updated E2E Title');
    await titleInput.blur();

    await page.waitForTimeout(1500);

    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: appendedText,
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  // Auth expiry e2e test removed: invalidating DB sessions doesn't cause
  // Cognito JWT validation to fail, so we can't simulate a real 401 in e2e.
  // The SyncService's auth-expired handling is covered by unit tests.

  test('posts paste-alert when pasting large text not copied from editor', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
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
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
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
    await page.waitForTimeout(500);

    expect(pasteAlertCount).toBe(0);
  });
});
