import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import {
  devPanelFreeTierGroupTrigger,
  devPanelFreeTierStateOption,
  openDevToolsPanel,
} from '../helpers/dev-panel-feedback';
import {
  listCatalogFreeTierJumpExpectations,
  type FreeTierJumpExpectation,
} from '../../app/dev-panel/free-tier-jump-expectations';
import { findFreeTierState } from '../../app/dev-panel/free-tier-states.catalog';

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

async function ensureDevTeacherSignedIn(page: Page) {
  await page.context().clearCookies();
  await page.request.post('/auth/dev-login', {
    form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
  });
}

type CatalogJumpEntry = FreeTierJumpExpectation & {
  stateId: string;
  label: string;
};

async function runCatalogStateJump(page: Page, entry: CatalogJumpEntry) {
  const softErrorsBefore = test.info().errors.length;
  await ensureDevTeacherSignedIn(page);
  await page.goto('/app/assignments');
  await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
  await page.reload();

  const tools = await openDevToolsPanel(page);
  await tools.getByRole('button', { name: /^Free-tier states/ }).click();
  const stateSheet = page.getByRole('dialog', { name: 'Free-tier states' });
  await expect(stateSheet).toBeVisible({ timeout: 15_000 });

  await stateSheet
    .getByRole('switch', { name: 'Use a throwaway test account' })
    .setChecked(true);

  const catalogEntry = findFreeTierState(entry.stateId);
  if (catalogEntry) {
    const groupTrigger = devPanelFreeTierGroupTrigger(
      stateSheet,
      catalogEntry.group.title
    );
    if ((await groupTrigger.getAttribute('aria-expanded')) !== 'true') {
      await groupTrigger.click();
    }
  }
  await devPanelFreeTierStateOption(stateSheet, entry.label).click();

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
    const checksPassed = test.info().errors.length === softErrorsBefore;
    const adminOk = pathname.includes(entry.redirectPath) && checksPassed;
    recordJumpLine(
      adminOk
        ? `${entry.stateId}: ok`
        : `${entry.stateId}: landed on ${pathname}`
    );
    return;
  }

  await page
    .waitForURL((url) => url.pathname.startsWith(expectedPathPrefix), {
      timeout: 120_000,
    })
    .catch(() => undefined);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);

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

  if (entry.pageTestId) {
    await expect
      .soft(page.getByTestId(entry.pageTestId))
      .toBeVisible({ timeout: 60_000 });
  }

  const checksPassed = test.info().errors.length === softErrorsBefore;
  const landedOk =
    pathname.startsWith(expectedPathPrefix) && checksPassed;
  recordJumpLine(
    landedOk
      ? `${entry.stateId}: ok`
      : `${entry.stateId}: landed on ${pathname}`
  );
}

test.describe('Dev panel free-tier state jumps', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.beforeAll(() => {
    mkdirSync(path.dirname(JUMP_LOG_PATH), { recursive: true });
    writeFileSync(JUMP_LOG_PATH, `# dev-panel free-tier jump catalog\n`, 'utf8');
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

  for (const entry of listCatalogFreeTierJumpExpectations()) {
    test(entry.stateId, async ({ page }) => {
      test.setTimeout(120_000);
      await runCatalogStateJump(page, entry);
    });
  }
});
