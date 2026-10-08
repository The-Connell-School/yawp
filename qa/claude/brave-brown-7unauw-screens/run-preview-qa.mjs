/**
 * Headless preview QA for PR #374. Requires env:
 *   PREVIEW_URL, PREVIEW_ACCESS_CODE
 * Optional: QA_OUT_DIR (defaults to this directory)
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const previewUrl = process.env.PREVIEW_URL?.replace(/\/$/, '');
const accessCode = process.env.PREVIEW_ACCESS_CODE;
const outDir =
  process.env.QA_OUT_DIR ||
  join(fileURLToPath(new URL('.', import.meta.url)));

/** Stable ids from packages/prisma/scripts/preview-planner-qa-ids.ts (preview seed). */
const QA = {
  insightAssignmentId: 'previewqa000assignment01',
  exitAssignmentId: 'previewqa000exitassign01',
  exitSubmissionId: 'previewqa000exitsubm0001',
};

if (!previewUrl || !accessCode) {
  console.error('PREVIEW_URL and PREVIEW_ACCESS_CODE are required');
  process.exit(1);
}

const shot = (name) => join(outDir, name);
mkdirSync(outDir, { recursive: true });

async function enterPreview(page) {
  await page.goto(`${previewUrl}/`);
  await page.getByLabel('Access code').fill(accessCode);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await page.waitForURL((url) => !url.pathname.includes('/auth/preview-access'), {
    timeout: 60_000,
  });
}

async function devLogin(page, email) {
  const ok = await page.evaluate(async (addr) => {
    const response = await fetch('/auth/dev-login', {
      method: 'POST',
      body: new URLSearchParams({ email: addr }),
    });
    return response.ok;
  }, email);
  if (!ok) throw new Error(`dev-login failed for ${email}`);
}

async function waitPacketSave(page) {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/api/domain/lesson-planner/packet') &&
      response.request().method() === 'POST',
    { timeout: 60_000 }
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const costRows = [];

  try {
    await enterPreview(page);
    await devLogin(page, 'dev.teacher@yawp.local');
    await page.goto(`${previewUrl}/app/lesson-planner`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('01-lesson-planner-home.png'), fullPage: true });

    await page.getByLabel('Message the Lesson Planner').fill(
      'Plan a 30-minute lesson on fixing comma splices for 9th grade. Include a yawp-slides deck, a printable student handout (yawp-material), and a yawp-exit-ticket check for understanding.'
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    const progress = page.getByTestId('planning-progress');
    if (await progress.isVisible().catch(() => false)) {
      await progress.waitFor({ state: 'hidden', timeout: 300_000 });
    }
    await page.getByTestId('slide-deck-card').first().waitFor({
      state: 'visible',
      timeout: 300_000,
    });
    await page.waitForURL(/[?&]c=/, { timeout: 30_000 }).catch(() => {});
    await page.screenshot({ path: shot('02-plan-with-cards.png'), fullPage: true });

    const deck = page.getByTestId('slide-deck-card').first();
    const material = page.getByTestId('material-card').first();
    const exitCard = page.getByTestId('exit-ticket-card').first();
    await exitCard.waitFor({ state: 'visible', timeout: 60_000 });

    const conversationId = new URL(page.url()).searchParams.get('c');
    if (!conversationId) throw new Error('missing conversation id');

    for (const toggle of [
      deck.getByTestId('material-toggle'),
      material.getByTestId('material-toggle'),
      exitCard.getByTestId('exit-ticket-stack-toggle'),
    ]) {
      if (!(await toggle.isVisible().catch(() => false))) continue;
      const save = waitPacketSave(page);
      await toggle.click();
      await save;
    }

    const presentLink = deck.getByRole('link', { name: 'Present' });
    const popupPromise = context.waitForEvent('page', { timeout: 5_000 }).catch(() => null);
    await presentLink.click();
    const popup = await popupPromise;
    const presentPage = popup ?? page;
    if (!popup) {
      await page.waitForURL(/\/present\//, { timeout: 30_000 });
    } else {
      await presentPage.waitForLoadState('networkidle');
    }
    await presentPage.screenshot({
      path: shot('03-present-mode.png'),
      fullPage: true,
    });
    if (popup) await presentPage.close();
    else await page.goBack();

    await page.goto(
      `${previewUrl}/app/lesson-planner/${conversationId}/packet`
    );
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('04-packet-stack.png'), fullPage: true });
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.getByTestId('packet-save-pdf').click(),
    ]);
    await download.saveAs(shot('05-packet.pdf'));

    await page.goto(`${previewUrl}/app/lesson-planner?c=${conversationId}`);
    await exitCard.getByTestId('exit-ticket-create').click();
    await page.getByRole('heading', { name: 'New Assignment' }).waitFor({
      timeout: 60_000,
    });
    await page.screenshot({
      path: shot('06-exit-ticket-assignment-sheet.png'),
      fullPage: true,
    });
    await page.keyboard.press('Escape');

    await page.goto(`${previewUrl}/app/reporter`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: shot('07-reporter-home.png'), fullPage: true });

    await page.goto(`${previewUrl}/app/my-classes`);
    await page.waitForLoadState('networkidle');
    const qaAssignmentLink = page
      .getByRole('link', { name: /\[QA\] Class summary insight/i })
      .first();
    await qaAssignmentLink.waitFor({ state: 'visible', timeout: 120_000 });
    const assignmentHref = await qaAssignmentLink.getAttribute('href');
    const classIdMatch = assignmentHref?.match(/\/my-classes\/([^/]+)/);
    if (!classIdMatch) throw new Error('could not resolve class id for QA insight');
    const classId = classIdMatch[1];

    await page.goto(
      `${previewUrl}/app/my-classes/${classId}/summary/${QA.insightAssignmentId}`
    );
    await page.waitForLoadState('networkidle');
    if (await page.getByText(/something didn't work|Class not found/i).isVisible().catch(() => false)) {
      const html = await page.content();
      writeFileSync(shot('07-class-summary-error.html'), html);
      throw new Error(
        'class summary route failed — preview seed-preview-planner-qa may not have run'
      );
    }
    await page.screenshot({
      path: shot('07b-class-summary-ready.png'),
      fullPage: true,
    });

    await page.getByRole('link', { name: /plan this lesson/i }).first().click();
    await page.waitForURL(/\/app\/lesson-planner/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('07c-planner-from-class-summary.png'),
      fullPage: true,
    });

    await devLogin(page, 'dev.student@yawp.local');
    await page.goto(`${previewUrl}/app`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08-student-no-lesson-planner.png'),
      fullPage: true,
    });
    if (await page.getByRole('link', { name: 'Lesson Planner' }).isVisible().catch(() => false)) {
      throw new Error('student should not see Lesson Planner');
    }

    await page.goto(`${previewUrl}/app/submissions/${QA.exitSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08b-student-unreleased-submission.png'),
      fullPage: true,
    });
    if (await page.getByText(/85%/).isVisible().catch(() => false)) {
      throw new Error('unreleased submission showed score to student');
    }
    const teacherContext = page.getByRole('region', { name: 'Teacher Context' });
    if (await teacherContext.isVisible().catch(() => false)) {
      throw new Error('unreleased submission leaked teacher context to student');
    }

    await devLogin(page, 'dev.teacher@yawp.local');
    await page.goto(`${previewUrl}/app/submissions/${QA.exitSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08c-teacher-graded-unreleased.png'),
      fullPage: true,
    });

    const release = page.getByRole('button', { name: /^Release/i }).first();
    if (await release.isVisible().catch(() => false)) {
      await release.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto(
        `${previewUrl}/app/my-classes/${classId}/assignments/${QA.exitAssignmentId}`
      );
      await page.getByRole('button', { name: /graded/i }).click();
      await page.getByRole('checkbox').first().check();
      await page.getByRole('button', { name: /release grades/i }).click();
      await page.waitForLoadState('networkidle');
    }

    await devLogin(page, 'dev.student@yawp.local');
    await page.goto(`${previewUrl}/app/submissions/${QA.exitSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08d-student-released-grade.png'),
      fullPage: true,
    });

    await devLogin(page, 'dev.admin@yawp.local');
    await page.goto(`${previewUrl}/app/admin/audit?feature=lesson-planner`);
    await page.waitForLoadState('networkidle');
    const items = page.getByTestId('audit-ai-log-item');
    const count = await items.count();
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheRead = 0;
    let cacheCreate = 0;
    for (let i = 0; i < count; i++) {
      await items.nth(i).click();
      const text = await items.nth(i).innerText();
      const inM = text.match(/Input tokens\s+(\d+)/);
      const outM = text.match(/Output tokens\s+(\d+)/);
      const crM = text.match(/"cacheReadInputTokens":\s*(\d+)/);
      const ccM = text.match(/"cacheCreationInputTokens":\s*(\d+)/);
      const row = {
        input: inM ? Number(inM[1]) : 0,
        output: outM ? Number(outM[1]) : 0,
      };
      costRows.push(row);
      inputTokens += row.input;
      outputTokens += row.output;
      if (crM) cacheRead += Number(crM[1]);
      if (ccM) cacheCreate += Number(ccM[1]);
    }
    const costUsd =
      (inputTokens * 3 +
        outputTokens * 15 +
        cacheRead * 0.3 +
        cacheCreate * 3.75) /
      1_000_000;
    await page.screenshot({ path: shot('09-admin-audit-tokens.png'), fullPage: true });

    writeFileSync(
      join(outDir, 'cost-measurement.json'),
      JSON.stringify(
        {
          measuredAt: new Date().toISOString(),
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreate,
          measuredLessonCostUsd: Number(costUsd.toFixed(4)),
        },
        null,
        2
      )
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          conversationId,
          costRows,
          inputTokens,
          outputTokens,
          cacheReadInputTokens: cacheRead,
          cacheCreationInputTokens: cacheCreate,
          measuredLessonCostUsd: costUsd.toFixed(4),
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
