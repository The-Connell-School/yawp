import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { db, ids, login, seedClassroomReportFixture } from '../helpers/classroom-report-fixture';
const before = process.env.REPORT_BEFORE === '1';
const evidence = process.env.REPORT_SHOTS;
const prefix = 'report-local-';
const reportUrl = '/app/classroom-report';
test.beforeAll(seedClassroomReportFixture);
test.afterAll(async () => { await db.$disconnect(); });

async function capture(page: Page, name: string) {
  if (!evidence) return;
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(evidence, { recursive: true });
  const file = `${page.viewportSize()!.width}-${name}.png`;
  await page.screenshot({ path: join(evidence, file), fullPage: true, animations: 'disabled', style: '[data-testid="class-code-trigger"], [data-testid="class-code-display"] { visibility:hidden!important }' });
  appendFileSync(join(evidence, 'manifest.jsonl'), JSON.stringify({ file, url: page.url(), viewport: page.viewportSize(), timestamp: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), baseSha: '7fd0ee1ba6ee6880ea19066a3b4437963492f26d', fixture: 'Disposable isolated project CLI local-dev database; report-local-* deterministic persisted fixtures', counts: name.includes('empty') ? [1, 0, 0, 0] : [2, 2, 2, 3], phase: before ? 'before' : 'after' }) + '\n');
}

for (const width of [1280, 390]) test(`teacher navigation, counts, copy and print (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  await page.goto('/app/my-classes');
  await capture(page, 'entry');
  const entry = page.getByRole('link', { name: 'Share this report', exact: true });
  if (before) { await expect(entry).toHaveCount(0); return; }
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`${reportUrl}$`));
  const report = page.getByTestId('classroom-report');
  await expect(report.getByRole('heading', { name: 'Classroom activity report' })).toBeVisible();
  for (const [metric, value] of [['activeClasses', '2'], ['enrolledStudents', '2'], ['assignments', '2'], ['submittedWriting', '3']]) await expect(report.getByTestId(metric!)).toHaveText(value!);
  await expect(report).toContainText('all years');
  await expect(report).toContainText('Generated at:');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'report');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).__copiedReport = text; } } });
    (window as any).__printCount = 0;
    window.print = () => { (window as any).__printCount++; };
  });
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Summary copied.');
  const text = await page.evaluate(() => (window as any).__copiedReport);
  expect(text).toBe(await page.getByLabel('Plain-text summary').inputValue());
  for (const fragment of ['Active classes: 2', 'Distinct enrolled students: 2', 'Assignments: 2', 'Submitted writing: 3', 'all years', 'Generated at:']) expect(text).toContain(fragment);
  for (const fragment of ['PRIVATE', '@yawp', 'http', 'Fixture teacher']) expect(text).not.toContain(fragment);
  await capture(page, 'copied');
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }); });
  await page.getByRole('button', { name: 'Copy summary', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not copy');
  await expect(page.getByLabel('Plain-text summary')).toBeVisible();
  await capture(page, 'copy-failed');
  await page.getByRole('button', { name: 'Print report', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__printCount)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(report).toBeVisible();
  await expect(page.getByRole('link', { name: 'Back to My Classes' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy summary', exact: true })).not.toBeVisible();
  await capture(page, 'print');
});

test('empty and partial activity stay honest', async ({ page }) => {
  test.skip(before);
  await login(page, 'empty');
  await page.goto(reportUrl);
  await expect(page.getByTestId('activeClasses')).toHaveText('1');
  for (const metric of ['enrolledStudents', 'assignments', 'submittedWriting']) await expect(page.getByTestId(metric)).toHaveText('0');
  await expect(page.getByText('No submitted writing in this scope yet.')).toBeVisible();
  await capture(page, 'empty');
  await page.setViewportSize({ width: 390, height: 900 });
  await capture(page, 'empty');
  await db.class.update({ where: { id: ids.emptyClass }, data: { isArchived: true } });
  try { await page.reload(); await expect(page.getByTestId('activeClasses')).toHaveText('0'); }
  finally { await db.class.update({ where: { id: ids.emptyClass }, data: { isArchived: false } }); }
});

for (const [teacher, classes, writing] of [['teacher', '2', '3'], ['other', '1', '1'], ['foreignTeacher', '1', '1']] as const) test(`direct requests retain the session scope (${teacher})`, async ({ page }) => {
  test.skip(before);
  await login(page, teacher);
  const crafted = `${reportUrl}?teacherId=${teacher === 'teacher' ? ids.other : ids.teacher}&organizationId=${teacher === 'foreignTeacher' ? ids.main : ids.foreign}&classId=${ids.foreignClass}`;
  await page.goto(crafted);
  await expect(page.getByTestId('activeClasses')).toHaveText(classes);
  await expect(page.getByTestId('submittedWriting')).toHaveText(writing);
  const direct = await page.request.get(`${crafted.replace('?', '.data?')}&_routes=routes/app.classroom-report`);
  expect(direct.status()).toBe(200);
  expect(direct.headers()['cache-control']).toBe('private, no-store');
  const body = await direct.text();
  expect(body).toContain('submittedWriting');
  expect(body).not.toContain('PRIVATE STUDENT WRITING');
  expect(body).not.toContain(ids.foreignClass!);
});

test('anonymous requests cannot access report aggregates', async ({ page }) => {
  test.skip(before);
  const anonymous = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 });
  expect(await anonymous.text()).not.toContain('submittedWriting');
});
for (const key of ['student', 'paidTeacher']) test(`${key} has no report entry or access`, async ({ page }) => {
  test.skip(before);
  await login(page, key);
  if (key === 'paidTeacher') await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/app/my-classes');
  await expect(page.getByRole('link', { name: 'Share this report', exact: true })).toHaveCount(0);
  if (key === 'paidTeacher') {
    const create = await page.getByRole('button', { name: 'Create Class', exact: true }).first().boundingBox();
    expect(create!.width).toBeGreaterThan(300);
  }
  const denied = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 });
  expect(denied.status()).toBe(403);
  expect(await denied.text()).not.toContain('submittedWriting');
});
test('inactive membership, approval and feature gates protect direct report requests', async ({ page }) => {
  test.skip(before);
  await login(page);
  for (const [status, destination] of [['SENT', '/app/free-tier/pending'], ['ACCOUNT_CREATED', '/app/free-tier/onboarding'], ['EXPIRED', '/app/free-tier/status'], ['REJECTED', '/app/free-tier/status']] as const) {
    await db.freeTierApplication.update({ where: { email: `${prefix}teacher@yawp.invalid` }, data: { status } });
    try {
      const denied = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 });
      const body = await denied.text();
      expect(body).toContain(destination);
      expect(body).not.toContain('submittedWriting');
    } finally { await db.freeTierApplication.update({ where: { email: `${prefix}teacher@yawp.invalid` }, data: { status: 'APPROVED' } }); }
  }
  await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: false } });
  try { expect(await (await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 })).text()).not.toContain('submittedWriting'); }
  finally { await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: true } }); }
  await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'false' } });
  try { const denied = await page.request.get(`${reportUrl}.data?_routes=routes/app.classroom-report`, { maxRedirects: 0 }); expect(denied.status()).toBe(404); expect(await denied.text()).not.toContain('submittedWriting'); }
  finally { await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'true' } }); }
});
