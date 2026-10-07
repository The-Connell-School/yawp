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

const PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL = 'dev.teacher.free@yawp.local';
const PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL = 'dev.student.free@yawp.local';
const OUT_DIR =
  process.env.QA_SCREENSHOT_DIR ??
  '/workspace/qa/cursor-free-tier-a-provisioning-quotas-f277-screens';

const base = (process.env.PREVIEW_URL ?? '').replace(/\/$/, '');
const code = process.env.PREVIEW_ACCESS_CODE?.trim();
if (!base || !code) {
  console.error('Set PREVIEW_URL and PREVIEW_ACCESS_CODE');
  process.exit(1);
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

async function devLogin(email) {
  const response = await page.request.post(`${base}/auth/dev-login`, {
    form: { email },
    maxRedirects: 0,
  });
  record(`dev-login ${email}`, response.ok(), String(response.status()));
}

async function postForm(path, form) {
  const response = await page.request.post(`${base}${path}`, { form });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

await page.goto(`${base}/?code=${encodeURIComponent(code)}`, {
  waitUntil: 'networkidle',
  timeout: 120_000,
});

await devLogin(PREVIEW_FREE_CLASSROOM_TEACHER_EMAIL);
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
  .getByText(/of 12 Class Starters left/i)
  .isVisible()
  .catch(() => false);
record('quota counter visible in creation sheet', quotaVisible);

const typeSelect = page.getByRole('combobox').first();
if (await typeSelect.count()) {
  await typeSelect.click();
  await page.waitForTimeout(500);
  await shot('07-free-classroom-type-options.png');
}

for (const kind of ['Prewriting', 'Thesis Statement']) {
  await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
  const tile = page.getByTestId('teacher-assignments-grid').getByRole('link', {
    name: new RegExp(kind, 'i'),
  });
  if (await tile.count()) {
    await tile.first().click();
    await page.waitForLoadState('networkidle');
    await shot(`11-${kind.toLowerCase().replace(/\s+/g, '-')}-type-page.png`);
    const hasModule = await page
      .getByText(/module|step|instruction|write/i)
      .first()
      .isVisible()
      .catch(() => false);
    record(`${kind} type page has module content`, hasModule);
  }
}

await page.goto(`${base}/app`, { waitUntil: 'networkidle' });
await newAssignment.first().click();
await page.keyboard.press('Escape');
await page.getByLabel(/title/i).fill('QA414 final quota starter');
await page.getByLabel(/prompt/i).fill('Quota preview create attempt.');
const classCheckbox = page.getByRole('checkbox').first();
if (await classCheckbox.count()) await classCheckbox.check();
const submit = page.getByRole('button', { name: /create|save/i }).last();
if (await submit.isEnabled()) {
  await submit.click();
  await page.waitForTimeout(2000);
}
await newAssignment.first().click();
await page.waitForTimeout(1000);
await shot('08-free-classroom-exhausted-picker.png');
const exhaustedCopy = await page
  .getByText(/used all 12 free Class Starters/i)
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
await shot('09-free-classroom-one-class-limit.png');

if (classId) {
  const bypassCreate = await postForm(`/app/my-classes/${classId}`, {
    intent: 'create-assignment',
    assignmentTypeId: 'cfreeclassstarter00000001',
    title: 'qa414 bypass create',
    prompt: 'should be refused',
    submitForGrade: 'true',
    gradingAssistantStrictnessLevel: 'balanced',
    tutorEnabled: 'true',
  });
  record(
    'my-classes create route refuses exhausted quota',
    bypassCreate.response.status() === 403 ||
      bypassCreate.body?.message?.match(/used all 12/i),
    JSON.stringify(bypassCreate.body)
  );

  const assignmentLink = page.locator(`a[href*="/app/assignments/"]`).first();
  const assignmentHref = await assignmentLink.getAttribute('href');
  const assignmentId = assignmentHref?.split('/').filter(Boolean).pop();
  if (assignmentId) {
    const bypassRetype = await postForm(
      `/app/assignments/${assignmentId}`,
      {
        intent: 'update-assignment',
        classId,
        assignmentTypeId: 'cfreeprewriting000000001',
        title: 'qa414 retype',
        prompt: 'should be refused if quota exhausted',
        submitForGrade: 'true',
        gradingAssistantStrictnessLevel: 'balanced',
      }
    );
    record(
      'assignment update route enforces retype quota',
      bypassRetype.response.status() === 403 ||
        Boolean(bypassRetype.body?.message),
      JSON.stringify(bypassRetype.body)
    );
  }
}

const secondClassAttempt = await postForm('/app/my-classes', {
  intent: 'create-class',
  schoolId: 'preview-free-classroom',
  schoolYear: '2026-2027',
  code: 'QA414B',
  grade: '10',
});
record(
  'second class create refused',
  secondClassAttempt.response.status() === 403 ||
    secondClassAttempt.body?.error?.includes('one class'),
  JSON.stringify(secondClassAttempt.body)
);

await devLogin(PREVIEW_FREE_CLASSROOM_STUDENT_EMAIL);
await page.goto(`${base}/app`, { waitUntil: 'networkidle', timeout: 120_000 });
await shot('10-free-classroom-student-home.png');

await writeFile(
  `${OUT_DIR}/qa-results.json`,
  JSON.stringify({ base, results }, null, 2)
);

await browser.close();
console.log('preview_qa_complete', JSON.stringify(results, null, 2));
