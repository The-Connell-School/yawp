/**
 * Resolve a preview document id for v2 capture scripts.
 */
export const DEFAULT_PREVIEW_V2_QA_DOCUMENT_ID = 'previewdoceditv2qa0001';
export const DEFAULT_PREVIEW_V2_QA_GRADED_DOCUMENT_ID = 'previewdoceditv2graded01';
/** Matches `PREVIEW_DOC_EDITOR_V2_QA_STUDENT_EMAIL` (dev.student@yawp.local) in preview seed. */
export const DEFAULT_PREVIEW_V2_QA_STUDENT_NAME = 'Sam Student';
export const DEFAULT_PREVIEW_V2_QA_STUDENT_EMAIL = 'dev.student@yawp.local';

const DOC_HREF = /\/app\/(?:documents|collab-documents)\/([^/?#]+)/;

export function parseDocumentIdFromHref(href) {
  if (!href) return null;
  const match = href.match(DOC_HREF);
  return match?.[1] ?? null;
}

/**
 * Log in as the v2 QA student on PR previews (document owned by dev.student@yawp.local).
 * Preview seats often omit Sam from the dev-login button grid; POST dev-login when needed.
 */
export async function loginPreviewQaStudent(context, baseUrl, options = {}) {
  const studentName =
    options.studentName?.trim() ||
    process.env.PREVIEW_DEV_STUDENT_NAME?.trim() ||
    DEFAULT_PREVIEW_V2_QA_STUDENT_NAME;
  const email =
    options.email?.trim() ||
    process.env.PREVIEW_STUDENT_EMAIL?.trim() ||
    DEFAULT_PREVIEW_V2_QA_STUDENT_EMAIL;

  const page = await context.newPage();
  await page.goto(`${baseUrl}/auth/dev-login`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const quickLogin = page.getByRole('button', {
    name: new RegExp(studentName, 'i'),
  });
  if ((await quickLogin.count()) > 0) {
    await waitForDevLoginShell(page, { studentName });
    await page.close();
    return;
  }

  const response = await context.request.post(`${baseUrl}/auth/dev-login`, {
    form: { email, redirectTo: '/app' },
    maxRedirects: 0,
  });
  if (response.status() < 300 || response.status() >= 400) {
    await page.close();
    throw new Error(
      `Preview dev-login POST for ${email} failed with HTTP ${response.status()}`
    );
  }
  await page.goto(`${baseUrl}/app`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.close();
}

export async function waitForDevLoginShell(page, options = {}) {
  const studentName =
    options.studentName?.trim() ||
    process.env.PREVIEW_DEV_STUDENT_NAME?.trim() ||
    DEFAULT_PREVIEW_V2_QA_STUDENT_NAME;
  await page
    .getByRole('button', { name: new RegExp(studentName, 'i') })
    .click({ timeout: 15_000 });
  const welcome = new RegExp(
    `Welcome,\\s*${studentName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`,
    'i'
  );
  await page
    .getByText(welcome)
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
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
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
  await page.goto(`${baseUrl}/app`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  const classPath = await page
    .locator('a[href*="/app/my-classes/"]')
    .first()
    .getAttribute('href')
    .catch(() => null);
  if (!classPath) return null;
  await page.goto(`${baseUrl}${classPath}?tab=assignments`, {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
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
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 45_000 }).catch(() => {});
  await page
    .locator('[data-document-editor-version="v2"]')
    .waitFor({ state: 'visible', timeout: 60_000 });
}