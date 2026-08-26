import { test, expect } from '../test-setup';

// A 1x1 PNG, small enough to inline. The feature does not care what the image
// is, only that a student made it somewhere else and can get it into the report.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

const PNG_1X1_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const CHART_ALT = 'Ten-year revenue for the global market';

type TransferFile = { name: string; type: string; base64: string };

/**
 * Fire a real paste or drop at the editor carrying real File objects.
 * Playwright's setInputFiles only drives the file picker, so the clipboard and
 * drag paths have to be dispatched in the page.
 */
async function dispatchFiles(
  page: import('@playwright/test').Page,
  kind: 'paste' | 'drop',
  files: TransferFile[]
) {
  await page.evaluate(
    ({ kind, files }) => {
      const transfer = new DataTransfer();
      for (const file of files) {
        const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
        transfer.items.add(new File([bytes], file.name, { type: file.type }));
      }

      const editor = document.querySelector('.ProseMirror') as HTMLElement;
      editor.focus();

      if (kind === 'paste') {
        editor.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: transfer,
            bubbles: true,
            cancelable: true,
          })
        );
        return;
      }

      const box = editor.getBoundingClientRect();
      editor.dispatchEvent(
        new DragEvent('drop', {
          dataTransfer: transfer,
          bubbles: true,
          cancelable: true,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height - 20,
        })
      );
    },
    { kind, files }
  );
}

test.describe.serial('Student image upload (GBA 300 expansion report)', () => {
  test.beforeEach(() => {
    // Every test here signs in, opens the document editor, and round-trips at
    // least one upload through the server. The 30s default does not cover
    // that on a cold runner.
    test.setTimeout(120_000);
  });

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

    // Wait for the save to actually land rather than sleeping a fixed
    // interval, then prove the figure came back from the server instead of
    // from the editor's in-memory document.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({
      timeout: 30000,
    });
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

  test('a pasted screenshot uploads and waits for a caption', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.imageUploadDocumentId, { retry: true });

    const before = await page.locator('figure.document-image').count();

    await dispatchFiles(page, 'paste', [
      { name: 'screenshot.png', type: 'image/png', base64: PNG_1X1_BASE64 },
    ]);

    const figures = page.locator('figure.document-image');
    await expect(figures).toHaveCount(before + 1, { timeout: 20000 });

    // Lands with an empty caption for the student to fill in inline.
    const caption = figures.last().locator('figcaption');
    await expect(caption).toHaveText('');

    await caption.click();
    await page.keyboard.type('Revenue by year');
    await expect(caption).toHaveText('Revenue by year');
    // The alt a screen reader announces is derived from the caption, so it has
    // to track the edit in the live DOM, not only in the saved HTML.
    await expect(figures.last().locator('img')).toHaveAttribute('alt', 'Revenue by year');
  });

  test('a dropped image uploads without splitting the figure above it', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.imageUploadDocumentId, { retry: true });

    await dispatchFiles(page, 'paste', [
      { name: 'first.png', type: 'image/png', base64: PNG_1X1_BASE64 },
    ]);
    await expect(page.locator('figure.document-image')).toHaveCount(1, { timeout: 20000 });

    // Park the caret inside the first figure's caption, which is exactly the
    // position that used to split that figure in two on the next insert.
    await page.locator('figure.document-image figcaption').first().click();
    await page.keyboard.type('First figure');

    await dispatchFiles(page, 'drop', [
      { name: 'second.png', type: 'image/png', base64: PNG_1X1_BASE64 },
    ]);

    await expect(page.locator('figure.document-image')).toHaveCount(2, { timeout: 20000 });
    await expect(page.locator('figure.document-image figcaption').first()).toHaveText(
      'First figure'
    );
  });

  test('dragging an existing figure around does not upload anything', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.imageUploadDocumentId, { retry: true });

    await dispatchFiles(page, 'paste', [
      { name: 'only.png', type: 'image/png', base64: PNG_1X1_BASE64 },
    ]);
    await expect(page.locator('figure.document-image')).toHaveCount(1, { timeout: 20000 });

    // A drop carrying no files is an internal move, never an upload.
    await dispatchFiles(page, 'drop', []);
    await page.waitForTimeout(1500);
    await expect(page.locator('figure.document-image')).toHaveCount(1);
  });

  test('an unsupported pasted file is reported and never uploaded', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }) => {
    await signIn('jdoe@brock.software', 'johndoe');
    await helpers.openDocument(e2eContext.imageUploadDocumentId, { retry: true });

    await dispatchFiles(page, 'drop', [
      {
        name: 'notes.txt',
        type: 'text/plain',
        base64: Buffer.from('Meeting notes, not an image.').toString('base64'),
      },
    ]);

    const status = page.getByTestId('editor-image-status');
    await expect(status).toBeVisible({ timeout: 15000 });
    await expect(status).toContainText(/not supported/i);
    // The message must survive: an earlier version cleared it instantly.
    await page.waitForTimeout(1500);
    await expect(status).toContainText(/not supported/i);
    await expect(page.locator('figure.document-image')).toHaveCount(0);
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
