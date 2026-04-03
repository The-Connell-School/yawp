import { test, expect } from '../test-setup';
import { TestHelpers } from '../test-helpers';
import type { Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { invalidateUserSessions } from '../db-helpers';

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

    const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);

    // Click on the editor to focus it
    await editor.click();

    // Type some content
    const testText = 'This is test content for e2e testing!';
    await editor.type(testText);

    // Verify the text appears in the editor
    await expect(editor).toContainText(testText);

    // Wait for auto-save to trigger (SyncService uses a 2s debounce)
    await page.waitForTimeout(4000);

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

    // Rapid typing simulation — use insertText for speed to avoid per-char timing variance
    const words = ['Rapid', 'typing', 'test', 'with', 'multiple', 'words'];
    for (const word of words) {
      await page.keyboard.insertText(`${word} `);
      // Small pause between words to keep them "rapid" but deterministic
      await page.waitForTimeout(50);
    }

    // Wait for debounced save to settle (1500ms debounce + network round-trip headroom)
    await page.waitForTimeout(4000);

    // Verify all content is present (use toPass for retry resilience)
    await expect(async () => {
      for (const word of words) {
        await expect(editor).toContainText(word);
      }
    }).toPass({ timeout: 5000 });

    // Due to debouncing, at least one save should have fired
    expect(saveRequests.length).toBeGreaterThan(0);

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

  test('locks editor and shows session modal when autosave gets auth failure', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
      await editor.click();
      await editor.type('Baseline text before session expiry.');
      await page.waitForTimeout(2200);

      await invalidateUserSessions({
        prisma,
        userId: e2eContext.userId,
      });

      await editor.click();
      await editor.type(' This text should trigger auth failure lock.');
      await expect(
        page.getByRole('heading', { name: /session expired/i })
      ).toBeVisible({ timeout: 10000 });
      await expect
        .poll(
          async () => page.locator('.ProseMirror').first().getAttribute('contenteditable'),
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
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      const editor = await openDocumentEditorWithRetry(page, e2eContext.documentId);
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
          async () => page.locator('.ProseMirror').first().getAttribute('contenteditable'),
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
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      await signIn('jdoe@brock.software', 'johndoe');
      await openDocumentEditorWithRetry(page, e2eContext.documentId);

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
