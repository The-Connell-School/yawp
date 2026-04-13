import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';

function uniqueText(prefix: string) {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test.describe.serial('Data Loss Regression Tests', () => {
  test('content survives tutor interaction during unsaved edits', async ({
    page,
    helpers,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId);
    const editor = helpers.getEditor();
    await editor.click();

    // Type unique content — do NOT wait for save debounce before interacting with tutor
    const text = uniqueText('tutor-survival');
    await editor.pressSequentially(text, { delay: 30 });
    await expect(editor).toContainText(text);

    // Attempt tutor interaction immediately (before save settles).
    // The tutor UI requires specific course module state, so be defensive.
    const tutorButton = page.getByTestId('tutor-chat-open');
    if (await tutorButton.count() > 0) {
      const tutorDisabled = await tutorButton.isDisabled();
      if (!tutorDisabled) {
        await tutorButton.click();

        const tutorInput = page.getByTestId('tutor-chat-input');
        if (await tutorInput.count() > 0) {
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
    await helpers.waitForSaved();
    await helpers.verifyPersistsOnReload(text);
  });

  test('content survives page visibility change (forceSave)', async ({
    page,
    helpers,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId);
    const editor = helpers.getEditor();
    await editor.click();

    const text = uniqueText('visibility-change');
    await editor.pressSequentially(text, { delay: 30 });
    await expect(editor).toContainText(text);

    // Set up save listener BEFORE triggering visibility change
    const savePromise = page.waitForResponse(
      (res) => /\/api\/document\/.*\/save/.test(res.url()),
      { timeout: 15000 },
    );

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

    // Wait for force save to flush to the server
    await savePromise;

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
    await helpers.verifyPersistsOnReload(text);
  });

  test('rapid edits followed by submission preserves all content', async ({
    page,
    helpers,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId);
    const editor = helpers.getEditor();
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
    const submitBtn = page.getByTestId('document-submit-button');
    if (await submitBtn.count() > 0) {
      await submitBtn.click();

      // Handle confirmation dialog if present
      const finalizeButton = page.getByTestId('document-finalize-submit');
      if (await finalizeButton.count() > 0) {
        await finalizeButton.click();
      }

      // Wait for submission save to complete
      await page.waitForResponse('**/api/document/*/save');

      // After submission, the content should still contain all phrases
      // (reload and verify on fresh page load)
      await page.reload();
      await page.waitForLoadState('networkidle');
      await helpers.waitForEditorReady();
      const editorAfter = page.locator(EDITOR_SELECTOR).first();
      for (const phrase of phrases) {
        await expect(editorAfter).toContainText(phrase);
      }
    } else {
      // No submit button — fall back to verifying save persistence
      await helpers.waitForSaved();

      await page.reload();
      await page.waitForLoadState('networkidle');
      await helpers.waitForEditorReady();
      const editorAfter = page.locator(EDITOR_SELECTOR).first();
      for (const phrase of phrases) {
        await expect(editorAfter).toContainText(phrase);
      }
    }
  });
});
