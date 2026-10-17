import { expect, test, type Page } from '@playwright/test';
import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { db, ids, login, seedClassroomReportFixture } from '../helpers/classroom-report-fixture';

const before = process.env.TRIAL_STATUS_BEFORE === '1';
const evidence = process.env.TRIAL_STATUS_SHOTS;
const route = '/app/free-tier/status';
const teacherEmail = 'report-local-teacher@yawp.invalid';
const fillerPrefix = 'trial-budget-local-';
test.beforeAll(async () => {
  await seedClassroomReportFixture();
  // Retain the budget charge even while testing a terminal application state.
  await db.freeTierApplication.update({ where: { email: teacherEmail }, data: { releasedAt: new Date() } });
  await db.freeTierApplication.deleteMany({ where: { email: { startsWith: fillerPrefix } } });
  await db.setting.upsert({ where: { name: 'feature_flag.lesson_planner' }, create: { name: 'feature_flag.lesson_planner', value: 'true', valueType: 'boolean' }, update: { value: 'true' } });
});
test.afterAll(async () => { await db.$disconnect(); });
async function status(status: 'APPROVED' | 'EXPIRED' | 'REJECTED' | 'SENT' | 'MANUAL_REVIEW' | 'ACCOUNT_CREATED' | 'ADMIN_SUBMITTED') {
  await db.freeTierApplication.update({ where: { email: teacherEmail }, data: { status } });
}
async function pauseBudget() {
  // The isolated runtime uses the existing default budget ($250 / $2.50).
  // Released EXPIRED applications still count, exactly as the guard specifies.
  const active = await db.freeTierApplication.count({ where: { OR: [{ releasedAt: { not: null } }, { status: { in: ['INVITED', 'ACCOUNT_CREATED', 'ADMIN_SUBMITTED', 'SENT', 'MANUAL_REVIEW', 'APPROVED'] } }] } });
  expect(active).toBeLessThan(100);
  await db.freeTierApplication.createMany({ data: Array.from({ length: 100 - active }, (_, i) => ({ email: `${fillerPrefix}${i}@yawp.invalid`, name: 'Local budget fixture', schoolName: 'Local fixture', location: 'Local', gradeLevel: '9', status: 'EXPIRED' as const, releasedAt: new Date() })) });
}
async function recoverBudget() { await db.freeTierApplication.deleteMany({ where: { email: { startsWith: fillerPrefix } } }); }
async function capture(page: Page, name: string) {
  if (!evidence) return;
  await page.evaluate(() => document.fonts.ready);
  mkdirSync(evidence, { recursive: true });
  const file = `${page.viewportSize()!.width}-${name}.png`;
  await page.screenshot({ path: join(evidence, file), fullPage: true, animations: 'disabled', style: '[data-testid="class-code-trigger"], [data-testid="class-code-display"] { visibility:hidden!important }' });
  appendFileSync(join(evidence, 'manifest.jsonl'), JSON.stringify({ file, url: page.url(), viewport: page.viewportSize(), timestamp: new Date().toISOString(), sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), routeBlob: execFileSync('git', ['hash-object', 'app/routes/app.free-tier.status/route.tsx']).toString().trim(), fixture: 'Disposable project CLI local-dev DB; report-local teacher; persisted application status; budget filler uses released EXPIRED rows at existing default threshold', phase: before ? 'before' : 'after' }) + '\n');
}
for (const width of [1280, 390]) test(`expiry, rejection, budget pause, reading and recovery (${width})`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await login(page);
  try {
    await page.goto('/app/my-classes');
    await capture(page, 'entry');
    if (!before) {
      await page.getByRole('link', { name: 'Free classroom status', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Free classroom access', exact: true })).toBeVisible();
    }
    await status('EXPIRED');
    await page.goto('/app/my-classes');
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expect(page.getByRole('heading', { name: before ? 'Invite expired' : 'Your free classroom trial has ended', exact: true })).toBeVisible();
    await capture(page, 'expired');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!before) {
      await expect(page.getByRole('link', { name: 'Email support', exact: true })).toHaveAttribute('href', 'mailto:support@yawp.school');
      await expect(page.getByRole('link', { name: 'Back to My Classes', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/login$/);
      await login(page);
    }
    await status('REJECTED');
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Request not approved', exact: true })).toBeVisible();
    await capture(page, 'rejected');
    await status('SENT');
    await page.goto(route);
    await expect(page).toHaveURL(/\/app\/free-tier\/pending$/);
    await capture(page, 'pending');
    await status('APPROVED');
    await pauseBudget();
    await page.goto(route);
    await expect(page.getByRole('heading', { name: before ? 'Invite expired' : 'Free classroom spending is paused', exact: true })).toBeVisible();
    await capture(page, 'budget-paused');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (!before) {
      await expect(page.locator('.auth-page-shell')).toContainText('environment');
      await expect(page.locator('.auth-page-shell')).toContainText('not a personal allowance');
      await page.getByRole('button', { name: 'Sign out', exact: true }).click();
      await expect(page).toHaveURL(/\/auth\/login$/);
      await login(page);
      await page.goto(route);
      await page.getByRole('link', { name: 'Back to My Classes', exact: true }).click();
      await expect(page).toHaveURL(/\/app\/my-classes$/);
      for (const path of ['/app/classroom-report', '/app/pitch-packet']) expect((await page.request.get(path)).status()).toBe(200);
      const reservations = await db.aiRequestReservation.count({ where: { organizationId: ids.main } });
      const conversations = await db.lessonPlanConversation.count({ where: { organizationId: ids.main } });
      const denial = await page.request.post('/api/domain/lesson-planner', { form: { intent: 'chat', message: 'Budget fixture must never reach a provider' } });
      expect(denial.status()).toBe(402);
      expect(await denial.json()).toMatchObject({ error: 'free_tier_budget_exceeded' });
      expect(await db.aiRequestReservation.count({ where: { organizationId: ids.main } })).toBe(reservations);
      expect(await db.lessonPlanConversation.count({ where: { organizationId: ids.main } })).toBe(conversations);
      await page.goto(route);
      await status('EXPIRED');
      await page.reload();
      await expect(page.getByRole('heading', { name: 'Your free classroom trial has ended', exact: true })).toBeVisible();
      await capture(page, 'combined-expiry-budget');
      await status('APPROVED');
    }
    await recoverBudget();
    await page.goto(route);
    await expect(page.getByRole('heading', { name: before ? 'Invite expired' : 'Free classroom access', exact: true })).toBeVisible();
    await capture(page, 'recovered');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/auth\/login$/);
  } finally { await status('APPROVED'); await recoverBudget(); }
});

test('authenticated document and independent data requests ignore tampered account and reason parameters', async ({ page }) => {
  test.skip(before);
  await login(page);
  for (const reason of ['expired', 'budget-paused']) for (const path of [route, `${route}.data`]) {
    const response = await page.request.get(`${path}?_routes=routes/app.free-tier.status&userId=${ids.foreignTeacherUser}&organizationId=${ids.foreign}&reason=${reason}`);
    expect(response.status()).toBe(200);
    expect(response.headers()['cache-control']).toBe('private, no-store');
    const text = await response.text();
    expect(text).toContain(path.endsWith('.data') ? 'available' : 'Free classroom access');
    for (const value of [ids.foreignTeacherUser!, ids.foreign!, 'trial-ended', 'budget-paused']) expect(text).not.toContain(value);
  }
});

for (const who of ['anonymous', 'student', 'paidTeacher']) test(`${who} cannot use either personalized request form`, async ({ page }) => {
  test.skip(before);
  if (who !== 'anonymous') await login(page, who);
  for (const path of [route, `${route}.data?_routes=routes/app.free-tier.status`]) {
    const response = await page.request.get(path, { maxRedirects: 0 });
    const text = await response.text();
    expect(text).not.toContain('trial-ended');
    expect(text).not.toContain('budget-paused');
    if (who === 'anonymous') expect(`${text}${response.headers().location}`).toContain('/auth/login');
    else expect(response.status()).toBe(404);
  }
});

test('inactive and foreign membership, pending gates and disabled feature protect direct data requests', async ({ page }) => {
  test.skip(before);
  await login(page);
  const direct = `${route}.data?_routes=routes/app.free-tier.status`;
  for (const [state, destination] of [['SENT', '/app/free-tier/pending'], ['MANUAL_REVIEW', '/app/free-tier/pending'], ['ACCOUNT_CREATED', '/app/free-tier/onboarding'], ['ADMIN_SUBMITTED', '/app/free-tier/onboarding']] as const) {
    await status(state);
    const response = await page.request.get(direct, { maxRedirects: 0 });
    expect(`${await response.text()}${response.headers().location}`).toContain(destination);
  }
  await status('APPROVED');
  await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: false } });
  try {
    const response = await page.request.get(direct, { maxRedirects: 0 });
    expect(`${await response.text()}${response.headers().location}`).toContain('/no-membership');
  } finally { await db.orgMembership.update({ where: { id: ids.teacher }, data: { isActive: true } }); }
  await db.freeTierApplication.update({ where: { email: teacherEmail }, data: { organizationId: ids.foreign } });
  try { expect((await page.request.get(direct)).status()).toBe(403); }
  finally { await db.freeTierApplication.update({ where: { email: teacherEmail }, data: { organizationId: ids.main } }); }
  await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'false' } });
  try { expect((await page.request.get(direct)).status()).toBe(404); }
  finally { await db.setting.update({ where: { name: 'feature_flag.free_tier' }, data: { value: 'true' } }); }
});
