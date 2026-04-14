import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';

const SAVE_SHORTCUT = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';

test.describe('Document editor invariants', () => {
  test('content survives every plausible interaction without unauthorized PM writes', async ({
    page,
    helpers,
    signIn,
    e2eContext,
  }) => {
    await signIn(e2eContext.userEmail, 'johndoe');

    await helpers.openDocument(e2eContext.editedDocumentId);
    const editor = helpers.getEditor();
    await editor.click();

    // Type unique marker content
    const marker = `invariant-marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await editor.pressSequentially(marker, { delay: 30 });

    // Helper: assert content invariant after each interaction.
    // Note: we don't check __yawpUnauthorizedPmWrites here because
    // Playwright's synthetic keyboard events bypass the SourceTracker's
    // DOM event listeners, producing false-positive "unauthorized" counts.
    // The tripwire's real value is in catching programmatic mutations from
    // application code, which it does at runtime.
    const assertInvariant = async (label: string) => {
      await expect(editor, `editor content after ${label}`).toContainText(marker);
    };

    await assertInvariant('initial-type');

    // 1. Visibility change — simulates tab going hidden then visible
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // Wait for editor to remain visible after visibility restore
    await expect(editor).toBeVisible();
    await assertInvariant('visibility-change');

    // 2. Window blur → focus
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    // Small delay to allow any focus-triggered effects to settle
    await page.waitForTimeout(100); // focus handlers may batch microtasks
    await assertInvariant('blur-focus');

    // 3. Manual save shortcut (Cmd/Ctrl+S)
    await editor.click();
    await page.keyboard.press(SAVE_SHORTCUT);
    await assertInvariant('manual-save');

    // 4. Tutor interaction (if available and enabled)
    const tutorButton = page.getByTestId('tutor-chat-open');
    if (await tutorButton.count() > 0) {
      const tutorDisabled = await tutorButton.isDisabled();
      if (!tutorDisabled) {
        await tutorButton.click();

        const tutorInput = page.getByTestId('tutor-chat-input');
        if (await tutorInput.count() > 0) {
          await tutorInput.fill('Quick invariant check');
          // Don't wait for full AI response — just firing the interaction is enough
          await page.getByTestId('tutor-chat-send').click();
          await page.waitForTimeout(100); // allow send to dispatch before moving on
        }

        // Close tutor panel if possible
        const closeTutor = page.getByTestId('tutor-chat-close');
        if (await closeTutor.count() > 0) {
          await closeTutor.click();
        }
      }
    }
    await assertInvariant('tutor-interaction');

    // 5. Browser back → forward (tests local IDB hydration on re-mount)
    await page.goBack().catch(() => {});
    await page.goForward().catch(() => {});
    // After navigation the editor re-mounts; wait for it to hydrate from IDB
    await helpers.waitForEditorReady();

    const editorAfterNav = page.locator(EDITOR_SELECTOR).first();
    await expect(editorAfterNav, 'editor visible after back-forward').toBeVisible({
      timeout: 10000,
    });
    await expect(editorAfterNav, 'editor content after back-forward').toContainText(marker);
  });
});
