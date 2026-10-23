import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { openDevToolsPanel } from '../helpers/dev-panel-feedback';
import { listCatalogFreeTierJumpExpectations } from '../../app/dev-panel/free-tier-jump-expectations';

const prisma = createE2EPrismaClient();

const JUMP_LOG_PATH = path.join(
  process.cwd(),
  'test-results',
  'dev-panel-free-tier-jump.log'
);

function recordJumpLine(line: string) {
  mkdirSync(path.dirname(JUMP_LOG_PATH), { recursive: true });
  appendFileSync(JUMP_LOG_PATH, `${line}\n`, 'utf8');
  console.log(line);
}

async function ensureDevTeacherSignedIn(page: import('@playwright/test').Page) {
  await page.context().clearCookies();
  await page.request.post('/auth/dev-login', {
    form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
  });
}

test.describe('Dev panel free-tier state jumps', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeEach(async () => {
    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      create: {
        name: 'feature_flag.free_tier',
        value: 'true',
        valueType: 'boolean',
      },
      update: { value: 'true' },
    });
    await prisma.setting.upsert({
      where: { name: 'feature_flag.lesson_planner' },
      create: {
        name: 'feature_flag.lesson_planner',
        value: 'true',
        valueType: 'boolean',
      },
      update: { value: 'true' },
    });
    await prisma.setting.upsert({
      where: { name: 'feature_flag.demo-feedback-widget' },
      create: {
        name: 'feature_flag.demo-feedback-widget',
        value: 'true',
        valueType: 'boolean',
      },
      update: { value: 'true' },
    });
  });

  test('every catalog state jumps successfully', async ({ page }) => {
    test.setTimeout(600_000);
    mkdirSync(path.dirname(JUMP_LOG_PATH), { recursive: true });
    appendFileSync(JUMP_LOG_PATH, `# dev-panel free-tier jump catalog\n`, 'utf8');

    const entries = listCatalogFreeTierJumpExpectations();

    for (const entry of entries) {
      await test.step(entry.stateId, async () => {
        await ensureDevTeacherSignedIn(page);
        await page.goto('/app/assignments');
        await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
        await page.reload();

        const tools = await openDevToolsPanel(page);
        await tools.getByRole('button', { name: /^Free-tier states/ }).click();
        const stateSheet = page.getByRole('dialog', { name: 'Free-tier states' });
        await expect(stateSheet).toBeVisible({ timeout: 15_000 });

        await stateSheet
          .getByRole('checkbox', { name: 'Use a throwaway test account' })
          .setChecked(true);
        await stateSheet
          .locator('label')
          .filter({ hasText: entry.label })
          .getByRole('radio')
          .check({ force: true });

        const jumpResponse = page.waitForResponse(
          (response) =>
            response.url().includes('/api/dev-panel/free-tier-jump') &&
            response.request().method() === 'POST',
          { timeout: 120_000 }
        );
        await stateSheet.getByRole('button', { name: 'Jump to this state' }).click();
        const response = await jumpResponse;
        const body = await response.json().catch(() => null);
        const jumpOk = response.ok() && body?.ok === true;

        expect.soft(response.ok(), `${entry.stateId} API HTTP status`).toBe(true);
        expect.soft(body?.ok, `${entry.stateId} API ok flag`).toBe(true);

        if (!jumpOk) {
          const err =
            typeof body?.error === 'string'
              ? body.error
              : `HTTP ${response.status()}`;
          recordJumpLine(`${entry.stateId}: ${err}`);
          return;
        }

        const redirectTo = String(body.redirectTo);
        const expectedPathPrefix = entry.redirectPath.split('?')[0]!;

        if (entry.adminSide) {
          await page.goto(redirectTo);
          const pathname = new URL(page.url()).pathname;
          expect
            .soft(pathname, `${entry.stateId} admin pathname`)
            .toContain(entry.redirectPath);
          if (entry.adminHeading) {
            await expect
              .soft(page.getByRole('heading', { name: entry.adminHeading }))
              .toBeVisible({ timeout: 30_000 });
          }
          const adminOk = pathname.includes(entry.redirectPath);
          recordJumpLine(
            adminOk ? `${entry.stateId}: ok` : `${entry.stateId}: landed on ${pathname}`
          );
          return;
        }

        await page
          .waitForURL(
            (url) => url.pathname.startsWith(expectedPathPrefix),
            { timeout: 120_000 }
          )
          .catch(() => undefined);

        const pathname = new URL(page.url()).pathname;
        expect
          .soft(pathname.startsWith(expectedPathPrefix), `${entry.stateId} pathname`)
          .toBe(true);

        if (entry.toastLabel) {
          await expect
            .soft(
              page.locator('.yawp-dev-panel-jump-toast').getByText(entry.toastLabel, {
                exact: false,
              })
            )
            .toBeVisible({ timeout: 30_000 });
        }

        if (entry.stateId === 'approved.reporter-limit') {
          await expect
            .soft(page.getByTestId('free-reporter-locked'))
            .toBeVisible({ timeout: 30_000 });
        }

        const landedOk = pathname.startsWith(expectedPathPrefix);
        recordJumpLine(
          landedOk ? `${entry.stateId}: ok` : `${entry.stateId}: landed on ${pathname}`
        );
      });
    }
  });
});
