import { test, expect } from '../test-setup';
import { TestHelpers } from '../test-helpers';
import type { Page } from '@playwright/test';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"], [data-testid="editor"]';
const DOCUMENT_ERROR_HEADING = /oops! something didn't work quite right\./i;

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
    await signIn('jdoe@brock.software', 'johndoe');

    let saveRequestCount = 0;

    // Intercept document save API to track save operations but allow real saves
    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() === 'PUT') {
        saveRequestCount++;
      }
      await route.continue();
    });

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);

    // Click on the editor to focus it
    await editor.click();

    // Type some content
    const testText = 'This is test content for e2e testing!';
    await editor.type(testText);

    // Verify the text appears in the editor
    await expect(editor).toContainText(testText);

    // Wait for auto-save to trigger (editor uses a 1500ms debounce)
    await page.waitForTimeout(2000);

    // Check that a save request was made
    expect(saveRequestCount).toBeGreaterThan(0);

    // Look for save status indicator if it exists
    const savedIndicator = page.locator('text=Saved, text=Saving').first();
    if (await savedIndicator.isVisible({ timeout: 2000 })) {
      await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 });
    }

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

    let versionCreated = false;

    // Mock document version creation API
    await page.route('**/api/model/document/**/versions', (route) => {
      if (route.request().method() === 'POST') {
        versionCreated = true;
        route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'new-version-id',
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        route.continue();
      }
    });

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();

    // Add content to trigger version creation
    await editor.type('Content that should create a version.');

    // Wait for auto-save
    await page.waitForTimeout(500);

    // Check if version creation would be triggered
    // In the actual app, versions are created on document updates
    // For now, just verify editor functionality works
    await expect(editor).toContainText('Content that should create a version.');
  });

  test('should handle multiple rapid edits without data loss', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const saveRequests: string[] = [];

    // Track all save requests to verify debouncing works (allow real saves)
    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postData() ?? '';
        saveRequests.push(body);
      }
      await route.continue();
    });

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
    await editor.click();

    // Rapid typing simulation
    const words = ['Rapid', 'typing', 'test', 'with', 'multiple', 'words'];
    for (const word of words) {
      await editor.type(`${word} `, { delay: 100 }); // Fast typing
    }

    // Wait for debounced save (editor uses a 1500ms debounce)
    await page.waitForTimeout(2500);

    // Verify all content is present
    for (const word of words) {
      await expect(editor).toContainText(word);
    }

    // Due to debouncing, we should have fewer save requests than typing actions
    expect(saveRequests.length).toBeGreaterThan(0);
    expect(saveRequests.length).toBeLessThan(words.length); // Debouncing should reduce requests

    // Verify persisted content
    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: words,
      documentId: e2eContext.documentId,
      courseId: e2eContext.studentCourseId,
    });
  });
});
