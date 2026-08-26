import { test, expect } from '../test-setup';

// A 1x1 PNG, small enough to inline. The feature does not care what the image
// is, only that a student made it somewhere else and can get it into the report.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const CHART_ALT = 'Ten-year revenue for the global market';

test.describe.serial('Student image upload (GBA 300 expansion report)', () => {
  test('a student uploads a figure and it survives a reload', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.imageUploadDocumentId, { retry: true });

    await expect(page.getByTestId('editor-add-image')).toBeVisible();

    await page.getByTestId('editor-image-file-input').setInputFiles({
      name: 'revenue.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });

    await expect(page.getByTestId('editor-image-preview')).toBeVisible({ timeout: 15000 });
    await page.locator('#document-image-alt').fill(CHART_ALT);
    await page.getByTestId('editor-image-insert').click();

    const figure = page.locator('figure.document-image img');
    await expect(figure).toHaveCount(1, { timeout: 20000 });
    await expect(figure).toHaveAttribute('alt', CHART_ALT);
    await expect(figure).toHaveAttribute('src', /^\/api\/image\/document\//);
    await expect(page.locator('figure.document-image figcaption')).toHaveText(CHART_ALT);

    // Let the sync service flush, then prove the figure came back from the
    // server rather than from the editor's in-memory document.
    await page.waitForTimeout(3000);
    await page.reload();
    await page.waitForSelector('figure.document-image img', { timeout: 30000 });

    const loaded = await page.evaluate(() => {
      const img = document.querySelector('figure.document-image img') as HTMLImageElement | null;
      return { src: img?.getAttribute('src') ?? null, naturalWidth: img?.naturalWidth ?? 0 };
    });
    expect(loaded.src).toMatch(/^\/api\/image\/document\//);
    // naturalWidth > 0 means the serve endpoint actually returned image bytes
    // to this session, not a 403 or a 404.
    expect(loaded.naturalWidth).toBeGreaterThan(0);
  });

  test('an unsupported file is refused without an upload', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.imageUploadDocumentId, { retry: true });

    const before = await page.locator('figure.document-image').count();

    await page.getByTestId('editor-image-file-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Meeting notes, not an image.'),
    });

    await expect(page.getByTestId('editor-image-error')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('editor-image-error')).toContainText(/not supported/i);
    await expect(page.getByTestId('editor-image-insert')).toBeDisabled();
    expect(await page.locator('figure.document-image').count()).toBe(before);
  });

  test('an assignment type outside the rollout has no image control', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

    await expect(page.locator('.ProseMirror')).toBeVisible();
    await expect(page.getByTestId('editor-add-image')).toHaveCount(0);

    // The endpoint refuses it too, not just the toolbar.
    const status = await page.evaluate(async (docId) => {
      const form = new FormData();
      form.set('file', new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' }));
      form.set('altText', 'direct call');
      const response = await fetch(`/api/document/${docId}/image`, {
        method: 'POST',
        body: form,
      });
      return response.status;
    }, e2eContext.editedDocumentId);

    expect(status).toBe(403);
  });
});
