/**
 * Capture 07b–08d only (preview seed fixtures). Requires PREVIEW_URL + PREVIEW_ACCESS_CODE.
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

const QA = {
  classId: 'previewqa000class00001',
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

async function main() {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  try {
    await enterPreview(page);
    await devLogin(page, 'dev.teacher@yawp.local');
    await page.goto(
      `${previewUrl}/app/my-classes/${QA.classId}/summary/${QA.insightAssignmentId}`
    );
    await page.waitForLoadState('networkidle');
    if (
      await page
        .getByText(/something didn't work|Class not found/i)
        .isVisible()
        .catch(() => false)
    ) {
      writeFileSync(shot('07-class-summary-error.html'), await page.content());
      throw new Error('class summary failed — seed-preview-planner-qa missing');
    }
    await page.screenshot({ path: shot('07b-class-summary-ready.png'), fullPage: true });
    await page.getByRole('link', { name: /plan this lesson/i }).first().click();
    await page.waitForURL(/\/app\/lesson-planner/, { timeout: 60_000 });
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('07c-planner-from-class-summary.png'),
      fullPage: true,
    });

    await devLogin(page, 'dev.student@yawp.local');
    await page.goto(`${previewUrl}/app/submissions/${QA.exitSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08b-student-unreleased-submission.png'),
      fullPage: true,
    });

    await devLogin(page, 'dev.teacher@yawp.local');
    await page.goto(`${previewUrl}/app/submissions/${QA.exitSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08c-teacher-graded-unreleased.png'),
      fullPage: true,
    });
    const releaseGrade = page.getByRole('button', { name: /Release Grade/i });
    if (await releaseGrade.isVisible().catch(() => false)) {
      await releaseGrade.click();
      await page.waitForLoadState('networkidle');
    } else {
      await page.goto(
        `${previewUrl}/app/my-classes/${QA.classId}/assignments/${QA.exitAssignmentId}`
      );
      await page.waitForLoadState('networkidle');
      const gradedTab = page.getByRole('button', { name: /graded/i });
      if (await gradedTab.isVisible().catch(() => false)) {
        await gradedTab.click();
        await page.getByRole('checkbox').first().check();
        await page.getByRole('button', { name: /release grades/i }).click();
        await page.waitForLoadState('networkidle');
      }
    }

    await devLogin(page, 'dev.student@yawp.local');
    await page.goto(`${previewUrl}/app/submissions/${QA.exitSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: shot('08d-student-released-grade.png'),
      fullPage: true,
    });
    console.log(JSON.stringify({ ok: true }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
