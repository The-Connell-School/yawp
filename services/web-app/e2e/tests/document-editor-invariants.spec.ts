import { test, expect } from '../test-setup';
import type { Page } from '@playwright/test';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"], [data-testid="editor"]';
const SAVE_SHORTCUT = process.platform === 'darwin' ? 'Meta+s' : 'Control+s';

async function openEditor(page: Page, documentId: string) {
  await page.goto(`/app/documents/${documentId}`);
  await page.waitForLoadState('networkidle');
  const editor = page.locator(EDITOR_SELECTOR).first();
  await expect(editor).toBeVisible({ timeout: 15000 });
  return editor;
}

test.describe('Document editor invariants', () => {
  test('content survives every plausible interaction without unauthorized PM writes', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    const editor = await openEditor(page, e2eContext.documentId);
    await editor.click();

    // Type unique marker content
    const marker = `invariant-marker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await editor.pressSequentially(marker, { delay: 30 });

    // Helper: assert both invariants after each interaction
    const assertInvariant = async (label: string) => {
      const unauthorized = await page.evaluate(
        () => (window as unknown as Record<string, unknown>).__yawpUnauthorizedPmWrites ?? 0
      );
      expect(unauthorized, `unauthorized PM writes after ${label}`).toBe(0);
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
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'visible',
        writable: true,
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    await assertInvariant('visibility-change');

    // 2. Window blur → focus
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForTimeout(300);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForTimeout(500);
    await assertInvariant('blur-focus');

    // 3. Manual save shortcut (Cmd/Ctrl+S)
    await editor.click();
    await page.keyboard.press(SAVE_SHORTCUT);
    await page.waitForTimeout(500);
    await assertInvariant('manual-save');

    // 4. Tutor interaction (if available and enabled)
    const tutorOpenButton = page.getByTestId('tutor-chat-open');
    const tutorVisible = await tutorOpenButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (tutorVisible) {
      const tutorDisabled = await tutorOpenButton.isDisabled().catch(() => true);
      if (!tutorDisabled) {
        await tutorOpenButton.click();

        const tutorInput = page.getByTestId('tutor-chat-input');
        const inputVisible = await tutorInput.isVisible({ timeout: 2000 }).catch(() => false);
        if (inputVisible) {
          await tutorInput.fill('Quick invariant check');
          // Don't wait for full AI response — just firing the interaction is enough
          await page.getByTestId('tutor-chat-send').click();
          await page.waitForTimeout(1000);
        }

        // Close tutor panel if possible
        const closeTutor = page.getByTestId('tutor-chat-close');
        if (await closeTutor.isVisible({ timeout: 1000 }).catch(() => false)) {
          await closeTutor.click();
          await page.waitForTimeout(300);
        }
      }
    }
    await assertInvariant('tutor-interaction');

    // 5. Browser back → forward (tests local IDB hydration on re-mount)
    await page.goBack().catch(() => {});
    await page.waitForTimeout(500);
    await page.goForward().catch(() => {});
    // After navigation the editor re-mounts; give it time to hydrate from IDB
    await page.waitForTimeout(1500);

    const editorAfterNav = page.locator(EDITOR_SELECTOR).first();
    await expect(editorAfterNav, 'editor visible after back-forward').toBeVisible({
      timeout: 10000,
    });
    await expect(editorAfterNav, 'editor content after back-forward').toContainText(marker);
    const unauthorizedAfterNav = await page.evaluate(
      () => (window as unknown as Record<string, unknown>).__yawpUnauthorizedPmWrites ?? 0
    );
    expect(unauthorizedAfterNav, 'unauthorized PM writes after back-forward').toBe(0);
  });
});
