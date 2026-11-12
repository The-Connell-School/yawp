import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import {
  listCatalogFreeTierJumpExpectations,
  type FreeTierJumpExpectation,
} from '../../app/dev-panel/free-tier-jump-expectations';
import { ensureDemoDevTeacherSession } from '../helpers/dev-panel-preview-access';

const prisma = createE2EPrismaClient();
const DEMO_ORG_ID = 'local-dev-org';

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

type CatalogJumpEntry = FreeTierJumpExpectation & {
  stateId: string;
  label: string;
};

type JumpResult = {
  jumpOk: boolean;
  body: { ok?: boolean; redirectTo?: string; error?: string } | null;
  status: number;
};

async function postFreeTierJump(
  page: Page,
  entry: CatalogJumpEntry
): Promise<JumpResult> {
  const response = await page.request.post('/api/dev-panel/free-tier-jump', {
    headers: { 'content-type': 'application/json' },
    data: {
      stateId: entry.stateId,
      throwaway: entry.throwawayRequired === true,
      organizationId: DEMO_ORG_ID,
    },
  });
  const raw = await response.text();
  let body: JumpResult['body'] = null;
  try {
    body = raw ? (JSON.parse(raw) as JumpResult['body']) : null;
  } catch {
    body = { error: raw.slice(0, 200) || 'non-json response' };
  }
  return {
    jumpOk: response.ok() && body?.ok === true,
    body,
    status: response.status(),
  };
}

async function runCatalogStateJump(page: Page, entry: CatalogJumpEntry) {
  const softErrorsBefore = test.info().errors.length;
  await ensureDemoDevTeacherSession(page);
  const jump = await postFreeTierJump(page, entry);

  expect.soft(jump.status < 400, `${entry.stateId} API HTTP status`).toBe(true);
  expect.soft(jump.body?.ok, `${entry.stateId} API ok flag`).toBe(true);

  if (!jump.jumpOk || !jump.body?.redirectTo) {
    const err =
      typeof jump.body?.error === 'string'
        ? jump.body.error
        : `HTTP ${jump.status}`;
    recordJumpLine(`${entry.stateId}: ${err}`);
    return;
  }

  const redirectTo = String(jump.body.redirectTo);
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

  const landingUrl = new URL(redirectTo, page.url());
  if (entry.toastLabel) {
    landingUrl.searchParams.set('devPanelJumpToast', entry.toastLabel);
  }
  await page.goto(landingUrl.toString());
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
  const landedOk = pathname.startsWith(expectedPathPrefix) && checksPassed;
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
