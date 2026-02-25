import { test, expect } from '../test-setup';
import type { Page } from '@playwright/test';

const EDITOR_SELECTOR = '.ProseMirror, [contenteditable="true"], [data-testid="editor"]';
const DOCUMENT_ERROR_HEADING = /oops! something didn't work quite right\./i;

async function openDocumentEditorWithRetry(
  page: Page,
  documentPathWithQuery: string
) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto(`/app/documents/${documentPathWithQuery}`);
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
        return;
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

test.describe.serial('Document Audio Flow E2E Tests', () => {
  test('does not bootstrap tutor audio when creating a new document', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.evaluate(() => {
      window.localStorage.setItem('speechEnabled', 'true');
    });

    let instructionAudioRequests = 0;
    await page.route('**/api/domain/audio/**', async (route) => {
      instructionAudioRequests += 1;
      await route.continue();
    });

    await page.goto(`/app/courses/${e2eContext.studentCourseId}`);
    await page.getByRole('button', { name: /^new/i }).click();
    await page.waitForURL('**/app/documents/**', { timeout: 15000 });
    await expect(page.locator(EDITOR_SELECTOR).first()).toBeVisible({
      timeout: 10000,
    });
    await page.waitForLoadState('networkidle');

    const currentUrl = new URL(page.url());
    expect(currentUrl.searchParams.has('spa')).toBe(false);
    expect(instructionAudioRequests).toBe(0);
  });

  test('ignores spa query and submits tutor requests with speech disabled', async ({
    page,
    signIn,
    e2eContext,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await page.evaluate(() => {
      window.localStorage.setItem('speechEnabled', 'true');
    });

    let instructionAudioRequests = 0;
    let tutorRequestBody: string | null = null;

    await page.route('**/api/domain/audio/**', async (route) => {
      instructionAudioRequests += 1;
      await route.continue();
    });

    await page.route('**/api/domain/tutor-response**', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      tutorRequestBody = route.request().postData() ?? '';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ audio: '' }),
      });
    });

    await openDocumentEditorWithRetry(page, `${e2eContext.documentId}?spa=1`);
    await expect
      .poll(() => new URL(page.url()).searchParams.get('spa'), { timeout: 10000 })
      .toBe(null);
    expect(instructionAudioRequests).toBe(0);

    await page.getByTestId('tutor-chat-open').click();
    await page
      .getByTestId('tutor-chat-input')
      .fill('Can you give me one revision suggestion?');
    await page.getByTestId('tutor-chat-send').click();

    await expect.poll(() => tutorRequestBody, { timeout: 60000 }).not.toBeNull();
    const speechEnabled = new URLSearchParams(tutorRequestBody ?? '').get(
      'speechEnabled'
    );
    expect(speechEnabled).toBe('false');
    expect(instructionAudioRequests).toBe(0);
  });
});
