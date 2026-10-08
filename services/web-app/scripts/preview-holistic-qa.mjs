/**
 * Headless PR preview QA for holistic points-only display.
 * Requires: PREVIEW_BASE_URL, PREVIEW_ACCESS_CODE (never commit the code).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.PREVIEW_BASE_URL?.replace(/\/$/, '');
const ACCESS_CODE = process.env.PREVIEW_ACCESS_CODE?.trim();
const OUT = process.env.QA_OUT_DIR || '/opt/cursor/artifacts/pr-411-qa';

const TEACHER = 'dev.teacher@yawp.local';
const STUDENT = 'dev.student@yawp.local';

if (!BASE || !ACCESS_CODE) {
  console.error('Missing PREVIEW_BASE_URL or PREVIEW_ACCESS_CODE');
  process.exit(1);
}

fs.mkdirSync(OUT, { recursive: true });

async function passPreviewGate(page) {
  await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/auth/preview-access')) {
    await page.getByLabel(/access code/i).fill(ACCESS_CODE);
    await page.getByRole('button', { name: /open preview/i }).click();
    await page.waitForURL(/\/(app|auth)/, { timeout: 60_000 });
  }
}

async function passwordLogin(page, email, password = 'yawp-dev') {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/auth/preview-access')) {
    await passPreviewGate(page);
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded' });
  }
  await page.getByLabel(/email/i).fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /^log in$/i }).click();
  await page.waitForURL(/\/app|\/enter-code/, { timeout: 90_000 });
  if (page.url().includes('/enter-code')) {
    throw new Error('Student needs class code; use a graded demo student in preview seat');
  }
}

function scoreHasPercent(text) {
  return /\d+\s*%/.test(text) || /\b[A-F][+-]?\s*\(\d/i.test(text);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);

  const report = { base: BASE, shots: [], checks: [] };

  try {
    await passPreviewGate(page);
    await passwordLogin(page, TEACHER);

    let classBase = '';
    let openedSubmission = false;
    for (const docsUrl of [
      `${BASE}/app/documents?status=needs-grading&reset=1`,
      `${BASE}/app/documents?status=graded&reset=1`,
      `${BASE}/app/documents?reset=1`,
    ]) {
      await page.goto(docsUrl, { waitUntil: 'domcontentloaded' });
      const holisticLink = page.getByRole('link', {
        name: /holistic tier demo/i,
      });
      if (await holisticLink.count()) {
        await holisticLink.first().click();
        openedSubmission = true;
        break;
      }
    }
    if (!openedSubmission) {
      await page.goto(`${BASE}/app/my-classes`, { waitUntil: 'domcontentloaded' });
      const classHrefs = await page
        .locator('a[href*="/app/my-classes/"]')
        .evaluateAll((anchors) =>
          anchors
            .map((a) => a.getAttribute('href'))
            .filter((href) => !!href && !href.endsWith('/my-classes'))
        );
      for (const href of classHrefs) {
        const base = `${BASE}${href.split('?')[0]}`;
        for (const status of ['needs-grading', 'needs-releasing', 'released']) {
          await page.goto(`${base}?tab=documents&status=${status}`, {
            waitUntil: 'domcontentloaded',
          });
          if (await page.getByText(/holistic tier demo/i).count()) {
            classBase = base;
            await page.getByText(/holistic tier demo/i).first().click();
            openedSubmission = true;
            break;
          }
        }
        if (openedSubmission) break;
      }
    }
    if (!openedSubmission) {
      throw new Error('Holistic Tier Demo submission not found on preview');
    }
    const classMatch = page.url().match(/\/app\/my-classes\/([^/?]+)/);
    if (classMatch) {
      classBase = `${BASE}/app/my-classes/${classMatch[1]}`;
    }
    if (!page.url().includes('/submissions/')) {
      await page.screenshot({
        path: path.join(OUT, 'debug-class-documents.png'),
        fullPage: true,
      });
      const links = await page.getByRole('link').allTextContents();
      fs.writeFileSync(
        path.join(OUT, 'debug-links.json'),
        JSON.stringify(links.slice(0, 80), null, 2)
      );
      throw new Error('Holistic Tier Demo submission not found in class documents');
    }

    const teacherShot = path.join(OUT, 'holistic-teacher-submission.png');
    await page.screenshot({ path: teacherShot, fullPage: true });
    report.shots.push(teacherShot);

    const panelText = await page.locator('body').innerText();
    report.checks.push({
      view: 'teacher',
      pointsOnly:
        /\d+\s*\/\s*20/.test(panelText) && !scoreHasPercent(panelText),
    });

    await context.clearCookies();
    await passPreviewGate(page);
    await passwordLogin(page, STUDENT);
    await page.goto(`${BASE}/app`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: /holistic tier demo/i }).first().click({
      timeout: 120_000,
    });
    const studentShot = path.join(OUT, 'holistic-student-submission.png');
    await page.screenshot({ path: studentShot, fullPage: true });
    report.shots.push(studentShot);
    const studentText = await page.locator('body').innerText();
    report.checks.push({
      view: 'student',
      pointsOnly:
        /\d+\s*\/\s*20/.test(studentText) && !scoreHasPercent(studentText),
    });

    await context.clearCookies();
    await passPreviewGate(page);
    await passwordLogin(page, TEACHER);
    const classes = await page.goto(`${BASE}/app/my-classes`, {
      waitUntil: 'domcontentloaded',
    });
    void classes;
    await page.getByRole('link').filter({ hasText: /class|english|demo/i }).first().click();
    const classUrl = page.url().split('?')[0];
    await page.goto(`${classUrl}?tab=documents&status=released`, {
      waitUntil: 'domcontentloaded',
    });
    const classShot = path.join(OUT, 'holistic-class-documents.png');
    await page.screenshot({ path: classShot, fullPage: true });
    report.shots.push(classShot);

    await page.goto(`${classBase}?tab=documents&status=released`, {
      waitUntil: 'domcontentloaded',
    });
    const legacyRow = page
      .getByRole('link')
      .filter({ hasNotText: /holistic/i })
      .filter({ hasText: /engagement|thesis|e2e|daily/i })
      .first();
    if (await legacyRow.count()) {
      await legacyRow.click();
      const legacyShot = path.join(OUT, 'legacy-weighted-percent.png');
      await page.screenshot({ path: legacyShot, fullPage: true });
      report.shots.push(legacyShot);
      const legacyText = await page.locator('body').innerText();
      report.checks.push({
        view: 'legacy',
        hasPercent: scoreHasPercent(legacyText),
      });
    }

    fs.writeFileSync(
      path.join(OUT, 'report.json'),
      JSON.stringify(report, null, 2)
    );
    console.log(JSON.stringify(report, null, 2));
  } catch (e) {
    await page
      .screenshot({ path: path.join(OUT, 'failure.png'), fullPage: true })
      .catch(() => {});
    console.error(e);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
