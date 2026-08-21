import { test, expect } from '../test-setup';
import { TestHelpers } from '../test-helpers';

function collectPageErrors(page: import('@playwright/test').Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error?.message ?? String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  return { pageErrors, consoleErrors };
}

test.describe('Document viewer should not surface unhandled AbortError', () => {
  test('quick-exit during initial load (ssv=1) does not trigger AbortError', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { pageErrors } = collectPageErrors(page);
    await signIn(e2eContext.userEmail, 'johndoe');

    // Begin navigation to the document page, then immediately navigate away.
    const params = new URLSearchParams({ ssv: '1', exitTo: '/app?tab=assignments' });
    const url = `/app/documents/${e2eContext.editedDocumentId}?${params.toString()}`;

    // Start the navigation and, without waiting for full load, redirect away.
    // Attach a catch immediately so Playwright does not surface the aborted goto.
    const nav = page.goto(url).catch(() => null);
    await page.goto('/app?tab=assignments', { waitUntil: 'domcontentloaded' });

    // The viewer must not leak an unhandled AbortError to the global scope.
    const hadAbortError = pageErrors.some((m) => /AbortError/i.test(m));
    expect(hadAbortError).toBeFalsy();
  });

  test('exit button while a save is in-flight (ssv=1) does not trigger AbortError', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { pageErrors } = collectPageErrors(page);
    await signIn(e2eContext.userEmail, 'johndoe');

    // Slow the save endpoint so it's very likely in-flight during exit.
    await page.route(/\/api\/document\/[^/]+\/save$/, async (route) => {
      // Delay to widen the abort window; ultimately let it resolve.
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });

    const params = new URLSearchParams({ ssv: '1', exitTo: '/app' });
    await page.goto(`/app/documents/${e2eContext.editedDocumentId}?${params.toString()}`);

    const helpers = new TestHelpers(page);
    await helpers.waitForEditorReady();

    // Type to schedule a save, then immediately click Exit to unmount the viewer.
    await helpers.typeInEditor('Trigger save then navigate away.');
    await page.getByRole('button', { name: /^exit$/i }).click();
    await page.waitForLoadState('networkidle');

    const hadAbortError = pageErrors.some((m) => /AbortError/i.test(m));
    expect(hadAbortError).toBeFalsy();
  });

  test('quick-exit during load (spa=1) does not trigger AbortError', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    const { pageErrors } = collectPageErrors(page);
    await signIn(e2eContext.userEmail, 'johndoe');

    const params = new URLSearchParams({ spa: '1', exitTo: '/app?tab=assignments' });
    const url = `/app/documents/${e2eContext.editedDocumentId}?${params.toString()}`;

    const nav = page.goto(url).catch(() => null);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    const hadAbortError = pageErrors.some((m) => /AbortError/i.test(m));
    expect(hadAbortError).toBeFalsy();
  });
});

