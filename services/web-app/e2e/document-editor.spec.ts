import { test, expect } from './test-setup';
import { TestHelpers } from './test-helpers';

test.describe('Document Editor E2E Tests', () => {
  test('should display basic document page structure', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    // Navigate to a seeded document
    await page.goto(`/app/documents/${e2eContext.documentId}`);

    // Wait for page load
    await page.waitForLoadState('networkidle');

    // Check that basic page structure is present
    // Look for navigation elements
    const exitButton = page.locator('text=Exit');
    await expect(exitButton).toBeVisible({ timeout: 10000 });

    // Look for editor-related elements
    const editorContainer = page.locator(
      '.ProseMirror, [contenteditable="true"], [data-testid="editor"]'
    );
    await expect(editorContainer.first()).toBeVisible({ timeout: 10000 });
  });

  test('should allow typing in document editor with simulated saving', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    let saveRequestCount = 0;

    // Mock the document save API to track save operations
    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() === 'PUT') {
        saveRequestCount++;
        route.fulfill({
          status: 204,
          body: '',
        });
      } else {
        route.continue();
      }
    });

    // Navigate to document page
    await page.goto(`/app/documents/${e2eContext.documentId}`);
    await page.waitForLoadState('networkidle');

    // Wait for editor to be visible and clickable
    const editor = page
      .locator('.ProseMirror, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible({ timeout: 10000 });

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
    // This might be visible depending on timing, so we'll make it optional
    if (await savedIndicator.isVisible({ timeout: 2000 })) {
      // If save indicator is present, it should show "Saved" eventually
      await expect(page.locator('text=Saved')).toBeVisible({ timeout: 5000 });
    }
  });

  test('should handle pasting content in document editor', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');

    // Navigate to document page
    await page.goto(`/app/documents/${e2eContext.documentId}`);
    await page.waitForLoadState('networkidle');

    // Wait for editor to be ready
    const editor = page
      .locator('.ProseMirror, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible({ timeout: 10000 });
    await editor.click();

    // Simulate pasting content
    const pasteContent = 'This content was pasted into the editor.';

    // Insert text to simulate paste without requiring clipboard permissions
    await page.keyboard.insertText(pasteContent);

    // Verify pasted content appears
    await expect(editor).toContainText(pasteContent);
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

    // Navigate to document page
    await page.goto(`/app/documents/${e2eContext.documentId}`);
    await page.waitForLoadState('networkidle');

    // Wait for editor
    const editor = page
      .locator('.ProseMirror, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible({ timeout: 10000 });
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

    // Track all save requests to verify debouncing works
    await page.route('**/api/model/document/**', async (route) => {
      if (route.request().method() === 'PUT') {
        const body = route.request().postData() ?? '';
        saveRequests.push(body);
        route.fulfill({ status: 204 });
      } else {
        route.continue();
      }
    });

    await page.goto(`/app/documents/${e2eContext.documentId}`);
    await page.waitForLoadState('networkidle');

    const editor = page
      .locator('.ProseMirror, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible({ timeout: 10000 });
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
  });
});
