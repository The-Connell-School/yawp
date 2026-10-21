import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { db, ids, login, seedClassroomReportFixture } from '../helpers/classroom-report-fixture';

const before = process.env.PACKET_BEFORE === '1';
const evidence = process.env.PACKET_SHOTS;
const packetUrl = '/app/pitch-packet';
test.beforeAll(seedClassroomReportFixture);
test.afterAll(async () => { await db.$disconnect(); });

async function capture(page: Page, name: string) {
  if (!evidence) return;
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(evidence, { recursive: true });
  const originalViewport = page.viewportSize()!;
  const packetHeight = await page.locator('#pitch-packet').evaluateAll(nodes => nodes[0]?.scrollHeight || 0);
  if (packetHeight) await page.setViewportSize({ ...originalViewport, height: Math.max(originalViewport.height, packetHeight + 64) });
  const file = `${page.viewportSize()!.width}-${name}.png`;
  await page.screenshot({ path: join(evidence, file), fullPage: true, animations: 'disabled', style: '[data-testid="class-code-trigger"], [data-testid="class-code-display"] { visibility:hidden!important }' });
  if (name === 'print' && originalViewport.width === 1280) await page.pdf({ path: join(evidence, 'packet-print.pdf'), format: 'Letter', printBackground: false, displayHeaderFooter: false });
  appendFileSync(join(evidence, 'manifest.jsonl'), JSON.stringify({ file, url: page.url(), viewport: page.viewportSize(), timestamp: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), baseSha: '35269b2b9c7509e0e75a87272785405e5dc58dc2', fixture: 'Disposable isolated project CLI local-dev database; report-local-* persisted fixtures', phase: before ? 'before' : 'after', media: name === 'print' ? 'print' : 'screen', entryBlob: execFileSync('git', ['hash-object', 'app/routes/app.my-classes._index/route.tsx']).toString().trim() }) + '\n');
  await page.setViewportSize(originalViewport);
}

for (const width of [1280, 390]) test(`teacher packet, content, copy recovery and print (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  await page.goto('/app/my-classes');
  await capture(page, 'entry');
  await expect(page.getByRole('link', { name: 'Share this report', exact: true })).toBeVisible();
  const entry = page.getByRole('link', { name: 'Trial pitch packet', exact: true });
  if (before) { await expect(entry).toHaveCount(0); return; }
  await entry.click();
  await expect(page).toHaveURL(new RegExp(`${packetUrl}$`));
  const packet = page.getByTestId('pitch-packet');
  await expect(packet.getByRole('heading', { name: 'Free classroom trial pitch packet', exact: true })).toBeVisible();
  for (const fragment of ['1 teacher seat', '35 student seats', '1 active class', 'Class Starter', 'Prewriting', 'Thesis Statement', 'Evaluation checklist', 'Submitted writing: 3', 'all years', 'not evidence of learning gains']) await expect(packet).toContainText(fragment);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await capture(page, 'packet');
  const text = await page.getByLabel('Plain-text packet').inputValue();
  for (const line of text.split('\n').filter(Boolean)) expect(await packet.innerText()).toContain(line);
  for (const fragment of ['PRIVATE', '@yawp', '/app/', 'http://', 'Fixture teacher']) expect(text).not.toContain(fragment);
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text: string) => { (window as any).__copiedPacket = text; } } });
    (window as any).__printCount = 0;
    window.print = () => { (window as any).__printCount++; };
  });
  await page.getByRole('button', { name: 'Copy packet', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Packet copied.');
  expect(await page.evaluate(() => (window as any).__copiedPacket)).toBe(text);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('Denied'); } } }); });
  await page.getByRole('button', { name: 'Copy packet', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Could not copy');
  await page.getByLabel('Plain-text packet').selectText();
  await capture(page, 'copy-recovery');
  await page.getByRole('button', { name: 'Print packet', exact: true }).click();
  expect(await page.evaluate(() => (window as any).__printCount)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  await expect(packet).toBeVisible();
  for (const control of await page.locator('nav, aside, button, textarea, [data-packet-controls]').all()) await expect(control).not.toBeVisible();
  for (const line of text.split('\n').filter(Boolean)) expect(await packet.innerText()).toContain(line);
  await capture(page, 'print');
});

test('all-zero activity still produces a useful packet and existing links work', async ({ page }) => {
  test.skip(before);
  await login(page, 'empty');
  await db.class.update({ where: { id: ids.emptyClass }, data: { isArchived: true } });
  try {
    await page.goto(packetUrl);
    for (const label of ['Active classes', 'Distinct enrolled students', 'Assignments', 'Submitted writing']) await expect(page.getByTestId('pitch-packet')).toContainText(`${label}: 0`);
    await expect(page.getByTestId('pitch-packet')).toContainText('Evaluation checklist');
    await capture(page, 'zero-activity');
    await page.setViewportSize({ width: 390, height: 900 });
    await capture(page, 'zero-activity');
    for (const [name, path] of [['Open activity report', '/app/classroom-report'], ['Open My Classes', '/app/my-classes'], ['Privacy policy', '/privacy'], ['Terms of service', '/terms']]) {
      await expect(page.getByRole('link', { name, exact: true })).toHaveAttribute('href', path!);
      expect((await page.request.get(path!)).status()).toBe(200);
    }
  } finally { await db.class.update({ where: { id: ids.emptyClass }, data: { isArchived: false } }); }
});

for (const [teacher, expected] of [['teacher', 3], ['other', 1], ['foreignTeacher', 1]] as const) test(`crafted selections stay scoped to ${teacher} on normal and independent requests`, async ({ page }) => {
  test.skip(before);
  await login(page, teacher);
  const query = `?teacherId=${ids.teacher}&organizationId=${ids.foreign}&classId=${ids.foreignClass}`;
  const normal = await page.goto(`${packetUrl}${query}`);
  expect(normal!.headers()['cache-control']).toBe('private, no-store');
  await expect(page.getByTestId('pitch-packet')).toContainText(`Submitted writing: ${expected}`);
  const direct = await page.request.get(`${packetUrl}.data${query}&_routes=routes/app.pitch-packet`);
  expect(direct.status()).toBe(200);
  expect(direct.headers()['cache-control']).toBe('private, no-store');
  const body = await direct.text();
  expect(body).toContain(`Submitted writing: ${expected}`);
  for (const value of ['PRIVATE STUDENT WRITING', ids.foreignClass!, ids.teacher!]) expect(body).not.toContain(value);
});

async function denied(page: Page, destination?: string, status?: number) {
    for (const url of [packetUrl, `${packetUrl}.data?_routes=routes/app.pitch-packet`]) {
      const response = await page.request.get(url, { maxRedirects: 0 });
      const body = await response.text();
      expect(body).not.toContain('Submitted writing:');
      if (destination) expect(`${response.headers().location || ''}${body}`).toContain(destination);
      if (status) expect(response.status()).toBe(status);
    }
}

test('anonymous requests cannot access the packet', async ({ page }) => {
  test.skip(before);
  await denied(page, '/auth/login');
});
for (const key of ['student', 'paidTeacher']) test(`${key} has no packet entry or access`, async ({ page }) => {
  test.skip(before);
  await login(page, key);
  await page.goto('/app/my-classes');
  await expect(page.getByRole('link', { name: 'Trial pitch packet', exact: true })).toHaveCount(0);
  await denied(page, undefined, 403);
});
test('inactive membership, application and flag gates protect both request forms', async ({ page }) => {
  test.skip(before);
  await login(page);
  for (const [status, destination] of [['SENT', '/app'], ['MANUAL_REVIEW', '/app'], ['ADMIN_SUBMITTED', '/app/free-tier/onboarding'], ['ACCOUNT_CREATED', '/app/free-tier/onboarding'], ['EXPIRED', '/app/free-tier/status'], ['REJECTED', '/app/free-tier/status']] as const) {
    await db.freeTierApplication.update({ where: { email: 'report-local-teacher@yawp.invalid' }, data: { status } });
    try { await denied(page, destination); }
    finally { await db.freeTierApplication.update({ where: { email: 'report-local-teacher@yawp.invalid' }, data: { status: 'APPROVED' } }); }
  }
  await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: false } });
  try { await denied(page); }
  finally { await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: true } }); }
  await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'false' } });
  try { await denied(page, undefined, 404); }
  finally { await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'true' } }); }
});
