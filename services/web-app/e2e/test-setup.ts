import { test as base, expect, Page, BrowserContext } from '@playwright/test';

// Extend the basic test to include custom fixtures
type TestFixtures = {
  authenticatedPage: Page;
  mockAuth: () => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  // Create a fixture for authenticated pages
  authenticatedPage: async ({ page }, use) => {
    // Mock authentication by intercepting requests or setting up test state
    await page.addInitScript(() => {
      // Mock any client-side auth state
      window.localStorage.setItem('test-mode', 'true');
    });
    
    // Intercept auth-related API calls and return mock responses
    await page.route('**/api/auth/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authenticated: true, userId: 'test-user-id' }),
      });
    });

    // Mock user profile endpoints
    await page.route('**/api/profile/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-id',
          name: 'Test User',
          email: 'test@example.com',
          isAdmin: false,
        }),
      });
    });

    await use(page);
  },

  // Mock auth function
  mockAuth: async ({ page }, use) => {
    const mockAuthFunction = async () => {
      // Mock document API endpoints for testing
      await page.route('**/api/model/document/**', async (route) => {
        const method = route.request().method();
        
        if (method === 'PUT') {
          // Mock document save
          route.fulfill({
            status: 204,
            body: '',
          });
        } else if (method === 'GET') {
          // Mock document fetch
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              id: 'test-document-id',
              title: 'Test Document',
              html: '<p>Initial content</p>',
              text: 'Initial content',
              versions: [
                {
                  id: 'version-1',
                  html: '<p>Previous version</p>',
                  text: 'Previous version',
                  createdAt: new Date().toISOString(),
                }
              ],
            }),
          });
        }
      });

      // Mock document versions API
      await page.route('**/api/model/document/*/versions', (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'version-1',
              html: '<p>Version 1</p>',
              text: 'Version 1',
              createdAt: new Date().toISOString(),
            },
          ]),
        });
      });
    };

    await use(mockAuthFunction);
  },
});

export { expect } from '@playwright/test';