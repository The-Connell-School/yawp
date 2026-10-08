/**
 * Headless preview QA for Free Tier A. Requires preview deploy with
 * seed-preview-free-classroom fixture and the Free classroom access seat code.
 *
 *   PREVIEW_URL=https://pr-414.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=<free-classroom-seat-code> \
 *   node scripts/preview-qa-free-classroom.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import {
  enterPreviewAccess,
  shouldUseDevLogin,
} from '../../../scripts/preview/smoke-login.mjs';

const PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL = 'dev.teacher.free@yawp.local';
const PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL = 'dev.student.free@yawp.local';
const OUT_DIR =
  process.env.QA_SCREENSHOT_DIR ??
  '/workspace/qa/cursor-free-tier-a-provisioning-quotas-f277-screens';

const base = (process.env.PREVIEW_URL ?? '').replace(/\/$/, '');
const code = process.env.PREVIEW_ACCESS_CODE?.trim();
const previewPassword =
  process.env.PREVIEW_LOGIN_PASSWORD?.trim() || 'yawp-dev';
const previewRuntime = process.env.PREVIEW_RUNTIME || 'fast';
const previewDataMode = process.env.PREVIEW_DATA_MODE || 'seed';
if (!base || !code) {
  console.error('Set PREVIEW_URL and PREVIEW_ACCESS_CODE');
  process.exit(1);
}

function cookiesFromHeader(cookieHeader, url) {
  const hostname = new URL(url).hostname;
  return cookieHeader
    .split('; ')
    .filter(Boolean)
    .map((pair) => {
      const index = pair.indexOf('=');
      const name = pair.slice(0, index);
      const value = pair.slice(index + 1);
      return { name, value, domain: hostname, path: '/' };
    });
}

const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) process.exitCode = 1;
}

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
});
const page = await context.newPage();

async function shot(name) {
  const path = `${OUT_DIR}/${name}`;
  await page.screenshot({ path, fullPage: true });
  console.log('screenshot', path);
  return path;
}

async function signInPreviewUser(email) {
  await context.clearCookies();
  const accessCookie = await enterPreviewAccess({
    baseUrl: base,
    accessCode: code,
  });
  await context.addCookies(cookiesFromHeader(accessCookie, base));

  const useDevLogin = shouldUseDevLogin({
    dataMode: previewDataMode,
    runtime: previewRuntime,
  });
  const response = await page.request.post(
    `${base}${useDevLogin ? '/auth/dev-login' : '/auth/login'}`,
    {
      form: useDevLogin
        ? { email, redirectTo: '/app' }
        : { email, password: previewPassword, redirectTo: '/app' },
      maxRedirects: 0,
    }
  );
  const loginOk =
    response.ok() || (response.status() >= 300 && response.status() < 400);
  record(
    useDevLogin ? `dev-login ${email}` : `password login ${email}`,
    loginOk,
    String(response.status())
  );
}

async function postForm(path, form) {
  const response = await page.request.post(`${base}${path}`, { form });
  const contentType = response.headers()['content-type'] ?? '';
  let body = {};
  let text = '';
  if (contentType.includes('json')) {
    body = await response.json().catch(() => ({}));
  } else {
    text = await response.text().catch(() => '');
  }
  return { response, body, text };
}

await signInPreviewUser(PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL);
await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
await shot('05-free-classroom-dashboard.png');

const tileTitles = await page
  .getByTestId('teacher-assignments-grid')
  .locator('h3')
  .allTextContents();
const allowed = new Set(['Class Starter', 'Prewriting', 'Thesis Statement']);
const unexpectedTiles = tileTitles.filter((title) => !allowed.has(title.trim()));
record(
  'dashboard shows only bundle assignment tiles',
  unexpectedTiles.length === 0 && tileTitles.length === 3,
  `tiles=${JSON.stringify(tileTitles)}`
);

const reporterLink = page.getByRole('link', { name: /^Reporter$/i });
record(
  'reporter nav hidden for free classroom',
  (await reporterLink.count()) === 0
);

const newAssignment = page
  .getByRole('button', { name: /new assignment/i })
  .or(page.getByRole('button', { name: /create assignment/i }));
await newAssignment.first().click();
await page.waitForTimeout(1000);
await shot('06-free-classroom-quota-picker.png');

const quotaVisible = await page
  .locator('[role="combobox"]')
  .filter({ hasText: /\d+ of \d+/ })
  .isVisible()
  .catch(() => false);
record('quota counter visible in creation sheet', quotaVisible);

const typeSelect = page.getByRole('combobox').first();
if (await typeSelect.count()) {
  await typeSelect.click();
  await page.waitForTimeout(500);
  await shot('07-free-classroom-type-options.png');
}

await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });

for (const kind of ['Prewriting', 'Thesis Statement']) {
  await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
  const tile = page
    .getByTestId('teacher-assignments-grid')
    .getByRole('link', { name: new RegExp(kind, 'i') });
  const href = await tile.first().getAttribute('href');
  if (!href) {
    record(`${kind} type page has real content`, false, 'missing tile link');
    continue;
  }
  await page.goto(`${base}${href}`, { waitUntil: 'networkidle', timeout: 120_000 });
  await shot(`11-${kind.toLowerCase().replace(/\s+/g, '-')}-type-page.png`);
  const hasTitle = await page
    .getByRole('heading', { name: new RegExp(kind, 'i') })
    .isVisible()
    .catch(() => false);
  const hasBody = await page
    .locator('main')
    .getByText(/assignment|module|prompt|write|step/i)
    .first()
    .isVisible()
    .catch(() => false);
  const notFound = await page
    .getByText(/assignment type not found/i)
    .isVisible()
    .catch(() => false);
  record(`${kind} type page has real content`, hasTitle && hasBody && !notFound);
}

await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
const tileImages = await page
  .getByTestId('teacher-assignments-grid')
  .locator('img')
  .count();
record('bundle tiles include artwork', tileImages >= 3, String(tileImages));

await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
await newAssignment.first().click();
await page.waitForTimeout(800);
const typeSelectForCreate = page.getByRole('combobox').first();
if (await typeSelectForCreate.count()) {
  await typeSelectForCreate.click();
  await page.waitForTimeout(600);
  await shot('08-free-classroom-exhausted-picker.png');
}
const exhaustedCopy = await page
  .getByRole('option', { name: /class starter/i })
  .getByText(/all 12 free Class Starters/i)
  .isVisible()
  .catch(() => false);
record('class starter exhaustion message visible', exhaustedCopy);

const classPage = await page.goto(`${base}/app/my-classes`, {
  waitUntil: 'networkidle',
  timeout: 120_000,
});
const classLink = page.locator('a[href*="/app/my-classes/"]').first();
const classHref = await classLink.getAttribute('href');
const classId = classHref?.split('/').filter(Boolean).pop();
record('provisioned teacher has a class', Boolean(classId), classId ?? '');

const addClass = page.getByRole('button', {
  name: /add class|new class|create class/i,
});
if (await addClass.count()) {
  await addClass.first().click();
  await page.waitForTimeout(800);
}
const oneClassLimitCopy = await page
  .getByText(/Free classroom accounts include one class/i)
  .isVisible()
  .catch(() => false);
const createClassSubmit = page
  .getByRole('dialog')
  .getByRole('button', { name: /^Create Class$/ });
const createClassSubmitDisabled =
  (await createClassSubmit.count()) > 0
    ? await createClassSubmit.isDisabled()
    : false;
await shot('09-free-classroom-one-class-limit.png');
record(
  'second class create refused in UI',
  oneClassLimitCopy && createClassSubmitDisabled,
  `message=${oneClassLimitCopy} submitDisabled=${createClassSubmitDisabled}`
);

if (classId) {
  await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
  const classStarterHref = await page
    .getByTestId('teacher-assignments-grid')
    .getByRole('link', { name: /class starter/i })
    .getAttribute('href');
  const classStarterTypeId = classStarterHref?.split('/').filter(Boolean).pop() ?? '';
  await page.goto(`${base}/app/my-classes/${classId}`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  const bypassCreate = await postForm(`/app/my-classes/${classId}`, {
    intent: 'create-assignment',
    assignmentTypeId: classStarterTypeId,
    title: 'qa414 bypass create',
    prompt: 'should be refused',
    submitForGrade: 'true',
    pointValue: '100',
    gradingAssistantStrictnessLevel: 'intermediate',
    tutorEnabled: 'true',
  });
  record(
    'my-classes create route refuses exhausted quota',
    bypassCreate.response.status() === 403 ||
      /used all 12/i.test(String(bypassCreate.body?.message ?? '')) ||
      /used all 12/i.test(bypassCreate.text ?? ''),
    `status=${bypassCreate.response.status()} ${JSON.stringify(bypassCreate.body)}`
  );

  const bypassApiCreate = await postForm('/api/assignments/create', {
    intent: 'create-assignment',
    classIds: classId,
    assignmentTypeId: classStarterTypeId,
    title: 'qa414 bypass api create',
    prompt: 'should be refused',
    submitForGrade: 'true',
    pointValue: '100',
    gradingAssistantStrictnessLevel: 'intermediate',
    tutorEnabled: 'true',
  });
  record(
    'api assignments create route refuses exhausted quota',
    bypassApiCreate.response.status() === 403 ||
      /used all 12/i.test(String(bypassApiCreate.body?.message ?? '')) ||
      /used all 12/i.test(bypassApiCreate.text ?? ''),
    JSON.stringify(bypassApiCreate.body) || bypassApiCreate.text?.slice(0, 200)
  );

  await page.goto(`${base}/app/assignments`, {
    waitUntil: 'networkidle',
    timeout: 120_000,
  });
  const assignmentLink = page.locator('a[href*="/app/assignments/"]').first();
  const assignmentHref =
    (await assignmentLink.count())
      ? await assignmentLink.getAttribute('href')
      : null;
  const assignmentId = assignmentHref?.split('/').filter(Boolean).pop();
  if (assignmentId) {
    await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
    const prewritingTypeId = (
      await page
        .getByTestId('teacher-assignments-grid')
        .getByRole('link', { name: /prewriting/i })
        .getAttribute('href')
    )
      ?.split('/')
      .filter(Boolean)
      .pop();
    const bypassRetype = await postForm(
      `/app/assignments/${assignmentId}`,
      {
        intent: 'update-assignment',
        classId,
        assignmentTypeId: prewritingTypeId,
        title: 'qa414 retype',
        prompt: 'should be refused if quota exhausted',
        submitForGrade: 'true',
        gradingAssistantStrictnessLevel: 'balanced',
      }
    );
    record(
      'assignment update route enforces retype quota',
      bypassRetype.response.status() === 403 ||
        /used all|not available|quota/i.test(
          String(bypassRetype.body?.message ?? '')
        ),
      `status=${bypassRetype.response.status()} ${JSON.stringify(bypassRetype.body)}`
    );
  } else {
    record(
      'assignment update route enforces retype quota',
      false,
      'no assignment link on class page'
    );
  }
}

await signInPreviewUser(PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL);
await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
await shot('10-free-classroom-student-home.png');

await writeFile(
  `${OUT_DIR}/qa-results.json`,
  JSON.stringify({ base, results }, null, 2)
);

await browser.close();
console.log('preview_qa_complete', JSON.stringify(results, null, 2));
