import { Page, expect } from '@playwright/test';

export class TestHelpers {
  constructor(private page: Page) {}

  /**
   * Mock authentication by bypassing login flow
   * This creates a mock session and user for testing
   */
  async mockAuthentication() {
    // Mock the authentication by setting up test data
    // In a real scenario, you might need to create test users in the database
    // or mock the authentication endpoints
    await this.page.addInitScript(() => {
      // Mock any client-side authentication state if needed
      window.localStorage.setItem('test-auth', 'true');
    });
  }

  /**
   * Navigate to a document page with authentication
   */
  async navigateToDocument(documentId: string) {
    await this.mockAuthentication();
    await this.page.goto(`/app/documents/${documentId}`);
  }

  /**
   * Wait for the editor to be loaded and ready
   */
  async waitForEditorReady() {
    // Wait for the TipTap editor to be loaded
    await this.page.waitForSelector('[data-testid="editor-content"], .ProseMirror', { timeout: 10000 });
    
    // Wait a bit more for the editor to be fully initialized
    await this.page.waitForTimeout(1000);
  }

  /**
   * Get the editor element
   */
  async getEditor() {
    return this.page.locator('[data-testid="editor-content"], .ProseMirror').first();
  }

  /**
   * Type text in the editor
   */
  async typeInEditor(text: string) {
    const editor = await this.getEditor();
    await editor.click();
    await editor.type(text);
  }

  /**
   * Paste content in the editor
   */
  async pasteInEditor(content: string) {
    const editor = await this.getEditor();
    await editor.click();
    
    // Use the clipboard API to paste
    await this.page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text);
    }, content);
    
    await this.page.keyboard.press('Control+V');
  }

  /**
   * Wait for the saving indicator to appear and disappear
   */
  async waitForSave() {
    // Wait for "Saving" indicator
    await this.page.waitForSelector('text=Saving', { timeout: 5000 });
    
    // Wait for "Saved" indicator
    await this.page.waitForSelector('text=Saved', { timeout: 10000 });
  }

  /**
   * Check if content is saved by verifying the saved indicator
   */
  async verifySaved() {
    await expect(this.page.locator('text=Saved')).toBeVisible();
  }

  /**
   * Get the current content of the editor
   */
  async getEditorContent() {
    const editor = await this.getEditor();
    return await editor.textContent();
  }

  /**
   * Clear the editor content
   */
  async clearEditor() {
    const editor = await this.getEditor();
    await editor.click();
    await this.page.keyboard.press('Control+A');
    await this.page.keyboard.press('Delete');
  }
}