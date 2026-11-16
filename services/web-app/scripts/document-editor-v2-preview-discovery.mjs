/**
 * Resolve a preview document id for v2 capture scripts.
 */
export const DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID = 'previewdoceditv2qa0001';
export const DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID = 'previewdoceditv2graded01';

const DOC_HREF = /\/app\/(?:documents|collab-documents)\/([^/?#]+)/;

export function parseDocumentIdFromHref(href) {
  if (!href) return null;
  const match = href.match(DOC_HREF);
  return match?.[1] ?? null;
}

export async function waitForDevLoginShell(page) {
  await page
    .getByRole('button', { name: /casey student/i })
    .click({ timeout: 15_000 });
  await page
    .getByText(/Welcome, Casey Student/i)
    .waitFor({ state: 'visible', timeout: 60_000 })
    .catch(async () => {
      await page.waitForURL((url) => !url.pathname.includes('dev-login'), {
        timeout: 60_000,
      });
    });
}

export async function resolvePreviewDocumentId(page, baseUrl, options = {}) {
  const {
    preferredId = process.env.DOCUMENT_ID?.trim() || DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID,
    gradedId = process.env.GRADED_DOCUMENT_ID?.trim() ||
      DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID,
    preferGraded = false,
  } = options;

  const candidateIds = preferGraded
    ? [gradedId, preferredId]
    : [preferredId, gradedId];

  for (const id of candidateIds) {
    if (!id) continue;
    try {
      await openPreviewV2Document(page, baseUrl, id);
      return id;
    } catch {
      // try next candidate / discovery path
    }
  }

  const tryParse = (href) => parseDocumentIdFromHref(href);

  const tryOpenCandidate = async (id) => {
    try {
      await openPreviewV2Document(page, baseUrl, id);
      return id;
    } catch {
      return null;
    }
  };

  const scanMyDocuments = async (status = 'in-progress') => {
    await page.goto(`${baseUrl}/app/my-documents?status=${status}`, {
      waitUntil: 'networkidle',
    });
    const hrefs = await page
      .locator('a[href*="/app/documents/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    for (const href of hrefs) {
      const id = tryParse(href);
      if (!id) continue;
      const opened = await tryOpenCandidate(id);
      if (opened) return opened;
    }
    return null;
  };

  for (const status of ['in-progress', 'all']) {
    const id = await scanMyDocuments(status);
    if (id) return id;
  }

  const bootstrapped = await bootstrapInProgressDocument(page, baseUrl);
  if (bootstrapped) {
    const opened = await tryOpenCandidate(bootstrapped);
    if (opened) return opened;
  }

  throw new Error('No preview document id found after login');
}

export async function bootstrapInProgressDocument(page, baseUrl) {
  await page.goto(`${baseUrl}/app`, { waitUntil: 'networkidle' });
  const classPath = await page
    .locator('a[href*="/app/my-classes/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (!classPath) return null;
  await page.goto(`${baseUrl}${classPath}?tab=assignments`, {
    waitUntil: 'networkidle',
  });
  const start = page
    .getByRole('button', { name: /Thesis essay|civic responsibility|Start writing|Start/i })
    .or(page.getByRole('link', { name: /Thesis essay|civic responsibility/i }))
    .first();
  if ((await start.count()) === 0) return null;
  await start.click();
  await page.waitForURL(/\/app\/documents\//, { timeout: 60_000 });
  const id = new URL(page.url()).pathname.split('/').pop()?.split('?')[0];
  return id ?? null;
}

export async function openPreviewV2Document(page, baseUrl, docId, query = '') {
  const q = query ? `${query}${query.includes('?') ? '&' : '?'}editor=v2` : '?editor=v2';
  await page.goto(`${baseUrl}/app/documents/${docId}${q}`, {
    waitUntil: 'networkidle',
  });
  await page
    .locator('[data-document-editor-version="v2"]')
    .waitFor({ state: 'visible', timeout: 45_000 });
}