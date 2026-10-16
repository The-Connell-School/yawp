import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { mkdir, readFile } from 'node:fs/promises';

const shots = process.env.CLASSCODE_SHOTS || `${process.env.TMPDIR}/classcode-shots`;
test('local class forms: flag off, Generate code, field collision, narrow screen', async ({ page }) => {
  const db = createE2EPrismaClient();
  const name = 'feature_flag.classcode-unique';
  const previous = await db.setting.findUnique({ where: { name } });
  const setFlag = async (value: string) => db.setting.upsert({ where: { name }, create: { name, value, valueType: 'boolean' }, update: { value } });
  const other = await db.class.findFirstOrThrow({ where: { school: { organization: { memberships: { some: { user: { email: 'dev.teacher@yawp.local' } } } } } } });
  try {
    await mkdir(shots, { recursive: true });
    await setFlag('false');
    await page.request.post('/auth/dev-login', { form: { email: 'dev.admin@yawp.local' } });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/app/organization/classes');
      await page.getByRole('button', { name: 'Create Class', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: 'Generate code' })).toHaveCount(0);
      await page.screenshot({ path: `${shots}/admin-${width}-before.png` });
    }
    await page.request.post('/auth/dev-login', { form: { email: 'dev.teacher@yawp.local' } });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/app/my-classes');
      await page.getByRole('button', { name: 'Create Class', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: 'Generate code' })).toHaveCount(0);
      await page.screenshot({ path: `${shots}/teacher-${width}-before.png` });
    }
    await page.request.post('/auth/dev-login', { form: { email: 'dev.admin@yawp.local' } });
    await setFlag('true');
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/app/organization/classes');
      await page.getByRole('button', { name: 'Create Class', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const input = dialog.getByLabel('Class Code', { exact: true });
      const before = await input.inputValue();
      await dialog.getByRole('button', { name: 'Generate code', exact: true }).click();
      await expect(input).not.toHaveValue(before);
      await expect(dialog).toBeVisible();
      await page.screenshot({ path: `${shots}/admin-${width}-generated.png` });
      await dialog.getByRole('combobox').first().click();
      await page.getByRole('option').first().click();
      await input.fill(other.code.toLowerCase());
      await dialog.getByRole('button', { name: 'Create Class', exact: true }).click();
      await expect(input).toHaveAttribute('aria-invalid', 'true');
      await expect(dialog.getByRole('alert')).toContainText('Class code already in use');
      await page.screenshot({ path: `${shots}/admin-${width}-collision.png` });
    }
    await page.request.post('/auth/dev-login', { form: { email: 'dev.teacher@yawp.local' } });
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 950 });
      await page.goto('/app/my-classes');
      await page.getByRole('button', { name: 'Create Class', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Generate code', exact: true }).click();
      await expect(dialog.getByLabel('Class Code', { exact: true })).toHaveValue(/^[A-Z2-9]{6}$/);
      await page.screenshot({ path: `${shots}/teacher-${width}-generated.png` });
      await dialog.getByLabel('Class Code', { exact: true }).fill(other.code.toLowerCase());
      await dialog.getByRole('button', { name: 'Create Class', exact: true }).click();
      await expect(dialog.getByLabel('Class Code', { exact: true })).toHaveAttribute('aria-invalid', 'true');
      await expect(dialog.getByRole('alert')).toContainText('Class code already in use');
      await page.screenshot({ path: `${shots}/teacher-${width}-collision.png` });
    }
    // A teacher cannot use the owner-only write endpoint directly.
    const unauthorized = await page.request.post('/app/organization/classes', {
      form: { intent: 'create-class', schoolId: other.schoolId, schoolYear: '2026-2027', code: 'FORGED' },
      maxRedirects: 0,
    });
    expect(unauthorized.status()).toBeGreaterThanOrEqual(300);
    expect(await db.class.count({ where: { code: 'FORGED' } })).toBe(0);
    // Keep local before/after pairs together for review.
    for (const role of ['admin', 'teacher']) {
      for (const width of [1280, 390]) {
        const before = (await readFile(`${shots}/${role}-${width}-before.png`)).toString('base64');
        const after = (await readFile(`${shots}/${role}-${width}-generated.png`)).toString('base64');
        await page.setViewportSize({ width: width * 2, height: 990 });
        await page.setContent(`<body style="margin:0;display:flex;font:16px sans-serif"><div>Flag off<img style="display:block" src="data:image/png;base64,${before}"></div><div>Flag on<img style="display:block" src="data:image/png;base64,${after}"></div></body>`);
        await page.screenshot({ path: `${shots}/${role}-${width}-side-by-side.png` });
      }
    }
  } finally {
    if (previous) await db.setting.update({ where: { name }, data: { value: previous.value } });
    else await db.setting.deleteMany({ where: { name } });
    await db.$disconnect();
  }
});
