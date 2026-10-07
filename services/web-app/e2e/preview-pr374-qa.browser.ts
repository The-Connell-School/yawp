/**
 * Headless preview QA for PR #374 against a live preview host.
 * Usage (from services/web-app):
 *   PREVIEW_URL=https://pr-374.preview.yawp.school \
 *   PREVIEW_ACCESS_CODE=kind-otter-1844 \
 *   QA_SCREENSHOT_DIR=/opt/cursor/artifacts/pr374-qa \
 *   bun run e2e/preview-pr374-qa.browser.ts
 */
import { chromium, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const previewUrl = process.env.PREVIEW_URL?.replace(/\/$/, '');
const accessCode = process.env.PREVIEW_ACCESS_CODE;
const screenshotDir =
  process.env.QA_SCREENSHOT_DIR || '/opt/cursor/artifacts/pr374-qa';
const teacherEmail = process.env.PREVIEW_TEACHER_EMAIL || 'dev.teacher@yawp.local';

if (!previewUrl || !accessCode) {
  console.error('PREVIEW_URL and PREVIEW_ACCESS_CODE are required');
  process.exit(1);
}

mkdirSync(screenshotDir, { recursive: true });

const shot = (name: string) => join(screenshotDir, name);

async function enterPreview(page: import('@playwright/test').Page) {
  await page.goto(`${previewUrl}/`);
  await page.getByLabel('Access code').fill(accessCode);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await page.waitForURL(/\/(auth\/preview-access)?/, { timeout: 60_000 });
  if (page.url().includes('/auth/preview-access')) {
    const orgSelect = page.getByLabel('Organization');
    if (await orgSelect.isVisible().catch(() => false)) {
      await orgSelect.selectOption({ index: 1 });
      await page
        .getByRole('button', { name: 'Continue to organization' })
        .click();
    }
  }
}

async function devLoginTeacher(page: import('@playwright/test').Page) {
  const response = await page.evaluate(async (email) => {
    const res = await fetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ email }),
    });
    return { ok: res.ok, status: res.status };
  }, teacherEmail);
  if (!response.ok) {
    throw new Error(`dev-login failed: HTTP ${response.status}`);
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  let measuredUsage: unknown = null;

  page.on('response', async (response) => {
    if (
      response.url().includes('/api/domain/lesson-planner') &&
      response.request().method() === 'POST' &&
      response.ok()
    ) {
      try {
        const json = await response.json();
        if (json?.usage || json?.aiUsage) {
          measuredUsage = json.usage ?? json.aiUsage;
        }
      } catch {
        // streaming or non-json
      }
    }
  });

  try {
    await enterPreview(page);
    await page.screenshot({ path: shot('00-after-access.png'), fullPage: true });

    await devLoginTeacher(page);
    await page.goto(`${previewUrl}/app/lesson-planner`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('01-lesson-planner-home.png'), fullPage: true });

    const composer = page.getByLabel('Message the Lesson Planner');
    await expect(composer).toBeVisible({ timeout: 60_000 });
    await composer.fill(
      'Plan a 25-minute lesson on comma splices for 9th grade. Include a short slide deck, one printable handout, and an exit ticket check for understanding about fixing comma splices.'
    );
    await page.getByRole('button', { name: 'Send message' }).click();

    const progress = page.getByTestId('planning-progress');
    if (await progress.isVisible().catch(() => false)) {
      await progress.waitFor({ state: 'hidden', timeout: 300_000 });
    }
    const plannerCard = page
      .getByTestId('slide-deck-card')
      .or(page.getByTestId('material-card'))
      .or(page.getByTestId('exit-ticket-card'))
      .first();
    await expect(plannerCard).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot('02-after-plan-reply.png'), fullPage: true });

    const deckCard = page.getByTestId('slide-deck-card').first();
    if (await deckCard.isVisible().catch(() => false)) {
      const addStack = deckCard.getByTestId('deck-toggle');
      if (await addStack.isVisible().catch(() => false)) {
        await addStack.click();
      }
      await deckCard.getByRole('link', { name: 'Present' }).click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: shot('03-slide-deck-present.png'), fullPage: true });
      await page.goBack();
      await page.waitForLoadState('networkidle');
    }

    const conversationMatch = page.url().match(/[?&]c=([^&]+)/);
    const conversationId = conversationMatch?.[1];
    if (conversationId) {
      await page.goto(
        `${previewUrl}/app/lesson-planner/${conversationId}/packet`
      );
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: shot('04-packet.png'), fullPage: true });

      const savePdf = page.getByTestId('packet-save-pdf');
      if (await savePdf.isVisible().catch(() => false)) {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 120_000 }),
          savePdf.click(),
        ]);
        await download.saveAs(shot('05-packet.pdf'));
      }
      await page.goto(`${previewUrl}/app/lesson-planner?c=${conversationId}`);
      await page.waitForLoadState('networkidle');
    }

    const exitCard = page.getByTestId('exit-ticket-card').first();
    if (await exitCard.isVisible().catch(() => false)) {
      await page.screenshot({ path: shot('06-exit-ticket-card.png'), fullPage: true });
      await exitCard.getByTestId('exit-ticket-create').click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({ path: shot('07-exit-ticket-sheet.png'), fullPage: true });
      await page.keyboard.press('Escape');
    }

    await page.goto(`${previewUrl}/app/reporter`);
    await page.waitForLoadState('networkidle');
    const planLink = page.getByRole('link', { name: /plan this lesson/i }).first();
    if (await planLink.isVisible().catch(() => false)) {
      await planLink.click();
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: shot('08-from-class-summary.png'),
        fullPage: true,
      });
    }

    await page.evaluate(async () => {
      await fetch('/auth/dev-login', {
        method: 'POST',
        body: new URLSearchParams({ email: 'dev.admin@yawp.local' }),
      });
    });
    await page.goto(`${previewUrl}/app/admin/audit?feature=lesson-planner`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('09-admin-llm-audit.png'), fullPage: true });

    const aiItems = page.getByTestId('audit-ai-log-item');
    const aiCount = await aiItems.count();
    let totalTokens = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheRead = 0;
    let cacheCreate = 0;
    for (let i = 0; i < Math.min(aiCount, 8); i++) {
      await aiItems.nth(i).click();
      const block = aiItems.nth(i);
      const tokensLine = await block.getByText(/^Tokens$/).locator('..').innerText().catch(() => '');
      const match = tokensLine.match(/Tokens\s*(\d+)/);
      if (match) totalTokens += Number(match[1]);
      const metaText = await block.innerText();
      const inputMatch = metaText.match(/inputTokens["\s:]+(\d+)/i);
      const outputMatch = metaText.match(/outputTokens["\s:]+(\d+)/i);
      const cacheReadMatch = metaText.match(/cacheReadInputTokens["\s:]+(\d+)/i);
      const cacheCreateMatch = metaText.match(
        /cacheCreationInputTokens["\s:]+(\d+)/i
      );
      if (inputMatch) inputTokens += Number(inputMatch[1]);
      if (outputMatch) outputTokens += Number(outputMatch[1]);
      if (cacheReadMatch) cacheRead += Number(cacheReadMatch[1]);
      if (cacheCreateMatch) cacheCreate += Number(cacheCreateMatch[1]);
    }

    const measuredLessonCostUsd =
      inputTokens > 0
        ? (
            (inputTokens * 3 + outputTokens * 15 + cacheRead * 0.3 + cacheCreate * 3.75) /
            1_000_000
          ).toFixed(4)
        : null;

    console.log(
      JSON.stringify(
        {
          ok: true,
          conversationId,
          measuredUsage,
          aiLogCount: aiCount,
          totalTokens,
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreate,
          measuredLessonCostUsd,
          screenshotDir,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
