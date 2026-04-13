import { Page, expect } from '@playwright/test';

/** Single source of truth for the editor DOM selector */
export const EDITOR_SELECTOR = '.ProseMirror';

export class TestHelpers {
  constructor(private page: Page) {}

  /** Open a document page and wait for the editor to be interactive */
  async openDocument(documentId: string, opts?: { retry?: boolean }) {
    const maxAttempts = opts?.retry ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await this.page.goto(`/app/documents/${documentId}`);
      await this.page.waitForLoadState('networkidle');
      try {
        await this.page.waitForSelector(EDITOR_SELECTOR, { state: 'visible', timeout: 15000 });
        // Wait for ProseMirror's view to be fully wired into the DOM AND
        // useEditorSync's update handler to be registered. Without this,
        // typing can outrace PM's input handlers or the sync handler.
        await this.page.waitForFunction(
          (sel) => {
            const el = document.querySelector(sel) as any;
            // pmViewDesc is set by ProseMirror when the view owns this DOM node
            return el?.pmViewDesc && el?.dataset?.syncReady === 'true';
          },
          EDITOR_SELECTOR,
          { timeout: 10000 },
        );
        // Brief settle for ProseMirror's internal DOM event handler attachment
        await this.page.waitForTimeout(500);
        return;
      } catch {
        if (attempt === maxAttempts) throw new Error(`Editor did not appear after ${maxAttempts} attempts`);
      }
    }
  }

  /** Wait for the editor to be loaded and ready */
  async waitForEditorReady() {
    await this.page.waitForSelector(EDITOR_SELECTOR, { state: 'visible', timeout: 15000 });
  }

  /** Get the editor locator */
  getEditor() {
    return this.page.locator(EDITOR_SELECTOR).first();
  }

  /** Type text in the editor */
  async typeInEditor(text: string) {
    const editor = this.getEditor();
    await editor.click();
    await editor.pressSequentially(text, { delay: 30 });
  }

  /** Paste content in the editor */
  async pasteInEditor(content: string) {
    const editor = this.getEditor();
    await editor.click();
    await this.page.evaluate(async (t) => {
      await navigator.clipboard.writeText(t);
    }, content);
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${mod}+V`);
  }

  /**
   * Wait for the SyncService to complete a full save round-trip.
   *
   * Polls the `data-save-count` attribute on the ProseMirror element,
   * which is incremented by useEditorSync whenever the SyncService
   * transitions to 'synced' status.
   */
  async waitForSaved(timeout = 15000) {
    await this.page.waitForFunction(
      (selector) => {
        const el = document.querySelector(selector);
        return el && parseInt(el.getAttribute('data-save-count') ?? '0', 10) > 0;
      },
      EDITOR_SELECTOR,
      { timeout },
    );
  }

  /** Get the current text content of the editor */
  async getEditorContent() {
    return this.getEditor().textContent();
  }

  /** Clear the editor content */
  async clearEditor() {
    const editor = this.getEditor();
    await editor.click();
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
    await this.page.keyboard.press(`${mod}+A`);
    await this.page.keyboard.press('Delete');
  }

  /** Click the Exit link if present */
  async clickExitIfPresent() {
    const exitLink = this.page.getByRole('link', { name: /exit/i });
    if (await exitLink.count()) {
      await exitLink.first().click();
      await this.page.waitForLoadState('networkidle');
    }
  }

  /** Reload the page and verify text is still in the editor */
  async verifyPersistsOnReload(expectedText: string) {
    await this.page.reload();
    await this.page.waitForLoadState('networkidle');
    await this.waitForEditorReady();
    const editor = this.getEditor();
    await expect(editor).toContainText(expectedText, { timeout: 10000 });
  }
}
