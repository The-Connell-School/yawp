import fs from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
if (!process.env.FREE_WELCOME_PORT) throw new Error('Use ./bin/project test --profile free-tier-welcome-live-browser');
const prisma = createE2EPrismaClient();
const flagName = 'feature_flag.free-tier-onboarding-v2';
const baseFlag = 'feature_flag.free_tier';
const prefix = `welcome-browser-${Date.now()}`;
const shots = process.env.FREE_WELCOME_EVIDENCE_DIR;
let saved: any[] = [];
async function flag(value: string | null) {
  if (value === null) await prisma.setting.deleteMany({ where: { name: flagName } });
  else await prisma.setting.upsert({ where: { name: flagName }, create: { name: flagName, value }, update: { value } });
}
async function capture(page: Page, name: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(shots, `${name}-impl.png`), fullPage: true, animations: 'disabled' });
}
async function fill(page: Page, suffix: string, grade = '11') {
  await page.getByLabel('First and last name').fill('Grace Okafor');
  await page.getByLabel('School email').fill(`${prefix}-${suffix}@example.edu`);
  await page.getByLabel('School name').fill('Lincoln High');
  await page.getByLabel('Location').fill('Local');
  await page.getByLabel('Grade level').selectOption(grade);
}
test.beforeAll(async () => {
  const url = new URL(process.env.E2E_DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || !url.pathname.includes('fto-free-page')) throw new Error('Isolated welcome DB required');
  saved = await prisma.setting.findMany({ where: { name: { in: [flagName, baseFlag] } } });
  await prisma.setting.upsert({ where: { name: baseFlag }, create: { name: baseFlag, value: 'true' }, update: { value: 'true' } });
});
test.afterAll(async () => {
  await prisma.freeTierApplication.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.acquisitionToken.deleteMany({ where: { label: { startsWith: prefix } } });
  for (const name of [flagName, baseFlag]) {
    const row = saved.find(x => x.name === name);
    if (row) await prisma.setting.update({ where: { name }, data: { value: row.value } });
    else await prisma.setting.deleteMany({ where: { name } });
  }
  await prisma.$disconnect();
});
for (const width of [1280, 390]) {
  test(`${width}: legacy controls, flagged welcome, errors, decline and organic/token signup`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await flag('false');
    await page.goto('/free');
    await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Grade level')).toHaveJSProperty('tagName', 'INPUT');
    await capture(page, `${width}-legacy-form`);
    await page.goto('/free/join');
    await expect(page.getByRole('heading', { name: "This invite link isn't valid" })).toBeVisible();
    await capture(page, `${width}-invite-before`);
    await page.goto('/auth/login');
    await capture(page, `${width}-non-free-before`);
    if (process.env.FREE_WELCOME_BASELINE_ONLY === '1') return;
    for (const value of [null, JSON.stringify({ mode: 'targeted', orgIds: ['default-org'] })]) {
      await flag(value); await page.goto('/free');
      await expect(page.getByLabel('Your name', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Grade level')).toHaveJSProperty('tagName', 'INPUT');
    }
    await flag('true'); await page.goto('/free');
    await expect(page.getByText("We're so glad you're here and we can't wait for you to Yawp! with your students")).toBeVisible();
    await expect(page.getByLabel('Grade level')).toHaveValue('');
    await capture(page, `${width}-v2-welcome`);
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByText('Enter your name.')).toBeVisible();
    await expect(page.getByText('Choose a grade level.')).toBeVisible();
    await capture(page, `${width}-v2-validation`);
    await fill(page, `${width}-below`, '7');
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('heading', { name: 'Free classrooms are for high school for now' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'hello@yawp.school' })).toHaveAttribute('href', 'mailto:hello@yawp.school');
    await capture(page, `${width}-v2-decline`);
    const row = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: `${prefix}-${width}-below@example.edu` } });
    expect(row.tags).toEqual(['below-hs']); expect(row.status).toBe('REJECTED');
    expect(row.userId).toBeNull(); expect(row.organizationId).toBeNull();
    expect(await prisma.freeTierEmailLog.count({ where: { applicationId: row.id } })).toBe(0);
    await page.goto('/free'); await fill(page, `${width}-organic`);
    await page.getByRole('button', { name: 'Join the waitlist' }).click();
    await expect(page.getByRole('heading', { name: "You're on the list!", exact: true })).toBeVisible();
    await expect(page.locator('.text-emerald-800')).toBeVisible();
    await capture(page, `${width}-v2-organic-success`);
    const token = await prisma.acquisitionToken.create({ data: { label: `${prefix}-${width}`, code: `${prefix}-${width}`, tokenHash: `${prefix}-${width}`, bypassWaitlist: true } });
    await page.goto(`/free?t=${token.code}`); await fill(page, `${width}-token`);
    await capture(page, `${width}-v2-token-form`);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Check your email', exact: true })).toBeVisible();
    await capture(page, `${width}-v2-token-success`);
    expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses).toBe(1);
    const application = await prisma.freeTierApplication.findUniqueOrThrow({ where: { email: `${prefix}-${width}-token@example.edu` } });
    expect(application.releaseEmailCopyVersion).toBe('free-tier-onboarding-v2');
    const captured = fs.readdirSync(path.join(process.env.TMPDIR!, 'free-welcome-mail')).map(file => JSON.parse(fs.readFileSync(path.join(process.env.TMPDIR!, 'free-welcome-mail', file), 'utf8'))).find(mail => mail.to === application.email);
    expect(captured.subject).toBe("You're in — start your YAWP! classroom!");
    await page.goto(`/free?t=${token.code}`); await fill(page, `${width}-token-below`, '8');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Free classrooms are for high school for now' })).toBeVisible();
    await capture(page, `${width}-v2-token-decline`);
    expect((await prisma.acquisitionToken.findUniqueOrThrow({ where: { id: token.id } })).uses).toBe(1);
    await prisma.acquisitionToken.update({ where: { id: token.id }, data: { bypassWaitlist: false } });
    await page.goto(`/free?t=${token.code}`); await fill(page, `${width}-token-waitlist`, '12');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(page.getByRole('heading', { name: "You're on the list!", exact: true })).toBeVisible();
    await capture(page, `${width}-v2-token-waitlist-success`);
    await page.goto('/free/join');
    await capture(page, `${width}-invite-after`);
    await page.goto('/auth/login');
    await capture(page, `${width}-non-free-after`);
    await flag('false'); await page.goto('/free');
    await capture(page, `${width}-legacy-after`);
  });
}
