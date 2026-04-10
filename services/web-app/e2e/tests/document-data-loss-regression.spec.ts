import { test, expect } from '../test-setup';
import { TestHelpers } from '../test-helpers';
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
  await expect(
    page.locator('text=Saved').first()
  ).toBeVisible({ timeout: 10000 });
}

function uniqueText(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe.serial('Data Loss Regression Tests', () => {
  test('content survives tutor interaction during unsaved edits', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openEditor(page, e2eContext.editedDocumentId);
    await editor.click();

    // Type unique content — do NOT wait for save debounce before interacting with tutor
    const text = uniqueText('tutor-survival');
    await editor.pressSequentially(text, { delay: 30 });
    await expect(editor).toContainText(text);

    // Attempt tutor interaction immediately (before save settles).
    // The tutor UI requires specific course module state, so be defensive.
    const tutorOpenButton = page.getByTestId('tutor-chat-open');
    const tutorVisible = await tutorOpenButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (tutorVisible) {
      const tutorDisabled = await tutorOpenButton.isDisabled();
      if (!tutorDisabled) {
        await tutorOpenButton.click();

        const tutorInput = page.getByTestId('tutor-chat-input');
        const inputVisible = await tutorInput.isVisible({ timeout: 3000 }).catch(() => false);

        if (inputVisible) {
          // Route tutor requests to track them but allow them through
          let tutorRequests = 0;
          await page.route('**/api/domain/tutor-response', async (route) => {
            if (route.request().method() === 'POST') tutorRequests += 1;
            await route.continue();
          });

          await tutorInput.fill('What can I improve about my writing?');
          await page.getByTestId('tutor-chat-send').click();

          // Wait up to 30s for tutor response (AI call can be slow)
          await expect
            .poll(() => tutorRequests, { timeout: 30000 })
            .toBeGreaterThanOrEqual(1);

          // Wait for tutor message to appear
          await expect(page.locator('[data-tutor-message="true"]').last()).toBeVisible({
            timeout: 30000,
          });
        }
      }
    }

    // Regardless of whether tutor was available, the editor content must survive
    await expect(editor).toContainText(text);

    // Wait for save to settle, then verify persistence
    const helpers = new TestHelpers(page);
    await helpers.verifySavedData({
      expectedTexts: text,
      documentId: e2eContext.editedDocumentId,
      courseId: e2eContext.studentCourseId,
    });
  });

  test('content survives page visibility change (forceSave)', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openEditor(page, e2eContext.editedDocumentId);
    await editor.click();

    const text = uniqueText('visibility-change');
    await editor.pressSequentially(text, { delay: 30 });
    await expect(editor).toContainText(text);

    // Dispatch visibilitychange event to simulate tab going hidden.
    // This triggers the SyncService forceSave path.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Give force save time to flush
    await page.waitForTimeout(3000);

    // Restore visibility so subsequent checks work
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    // Verify content persisted by reloading
    await page.reload();
    await page.waitForLoadState('networkidle');

    const editorAfterReload = page.locator(EDITOR_SELECTOR).first();
    await expect(editorAfterReload).toBeVisible({ timeout: 15000 });
    await expect(editorAfterReload).toContainText(text);
  });

  test('rapid edits followed by submission preserves all content', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openEditor(page, e2eContext.editedDocumentId);
    await editor.click();

    // Type several distinct phrases rapidly (minimal delay to stress the debounce)
    const phrases = [
      uniqueText('rapid-a'),
      uniqueText('rapid-b'),
      uniqueText('rapid-c'),
    ];

    for (const phrase of phrases) {
      await editor.pressSequentially(phrase + ' ', { delay: 10 });
    }

    // Verify all phrases are present in the editor immediately
    for (const phrase of phrases) {
      await expect(editor).toContainText(phrase);
    }

    // If a submit button exists, click it to test the pre-submission flush
    const submitButton = page.getByTestId('document-submit-button');
    const submitVisible = await submitButton.isVisible({ timeout: 2000 }).catch(() => false);

    if (submitVisible) {
      await submitButton.click();

      // Handle confirmation dialog if present
      const finalizeButton = page.getByTestId('document-finalize-submit');
      const finalizeVisible = await finalizeButton.isVisible({ timeout: 3000 }).catch(() => false);
      if (finalizeVisible) {
        await finalizeButton.click();
      }

      // Wait for submission to complete
      await page.waitForTimeout(3000);

      // After submission, the content should still contain all phrases
      // (reload and verify on fresh page load)
      await page.reload();
      await page.waitForLoadState('networkidle');
      const editorAfter = page.locator(EDITOR_SELECTOR).first();
      await expect(editorAfter).toBeVisible({ timeout: 15000 });
      for (const phrase of phrases) {
        await expect(editorAfter).toContainText(phrase);
      }
    } else {
      // No submit button — fall back to verifying save persistence
      await waitForSaveIndicator(page);
      await page.waitForTimeout(2000);

      await page.reload();
      await page.waitForLoadState('networkidle');
      const editorAfter = page.locator(EDITOR_SELECTOR).first();
      await expect(editorAfter).toBeVisible({ timeout: 15000 });
      for (const phrase of phrases) {
        await expect(editorAfter).toContainText(phrase);
      }
    }
  });
});
