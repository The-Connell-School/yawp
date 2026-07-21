import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from '../test-setup';

const WCAG_21_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

type AxeViolation = {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: Array<{ target: string[]; html: string; failureSummary?: string }>;
};

function formatViolations(violations: AxeViolation[]) {
  return violations
    .map((violation) => {
      const nodeSummary = violation.nodes
        .slice(0, 3)
        .map((node) => {
          const target = node.target.join(' ');
          const reason = node.failureSummary?.replace(/\s+/g, ' ').trim();
          return `  - ${target}: ${reason || node.html}`;
        })
        .join('\n');

      return [
        `${violation.impact?.toUpperCase() ?? 'UNKNOWN'} ${violation.id}: ${violation.help}`,
        violation.helpUrl,
        nodeSummary,
      ].join('\n');
    })
    .join('\n\n');
}

async function scanPage(page: Page, testInfo: TestInfo, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_21_AA_TAGS)
    .analyze();
  const blockingViolations = results.violations.filter((violation) =>
    BLOCKING_IMPACTS.has(violation.impact ?? '')
  ) as AxeViolation[];

  await testInfo.attach(`${label}-axe-results.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });

  expect(
    blockingViolations,
    `${label} has serious/critical WCAG violations:\n${formatViolations(blockingViolations)}`
  ).toEqual([]);
}

test.describe.serial('UA accessibility axe audit', () => {
  test('login page has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
  }, testInfo) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    await scanPage(page, testInfo, 'auth-login');
  });

  test('public accessibility page has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
  }, testInfo) => {
    await page.goto('/accessibility');
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).toBeVisible();

    await scanPage(page, testInfo, 'public-accessibility');
  });

  test('student document editor has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }, testInfo) => {
    await signIn(e2eContext.userEmail, 'johndoe');
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });

    await scanPage(page, testInfo, 'student-document-editor');
  });

  test('teacher dashboard has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
    signIn,
    e2eContext,
  }, testInfo) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();

    await scanPage(page, testInfo, 'teacher-dashboard');
  });

  test('mobile app shell controls have stable names and preserve behavior', async ({
    page,
    signIn,
    e2eContext,
  }, testInfo) => {
    const holdForReview = async () => {
      if (process.env.E2E_VIDEO === 'on') {
        await page.waitForTimeout(4_000);
      }
    };
    await page.setViewportSize({ width: 390, height: 844 });
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/teacher-trainings');
    await expect(
      page.getByRole('heading', { name: "Teacher's Lounge" })
    ).toBeVisible();

    const openNavigation = page.getByRole('button', {
      name: 'Open app navigation',
      exact: true,
    });
    const reloadPage = page.getByRole('button', {
      name: 'Reload page',
      exact: true,
    });
    await expect(openNavigation).toBeVisible();
    await expect(reloadPage).toBeVisible();
    await holdForReview();

    await openNavigation.click();
    const closeNavigation = page.getByRole('button', {
      name: 'Close app navigation',
      exact: true,
    });
    await expect(closeNavigation).toBeVisible();
    const navigation = page.getByRole('navigation');
    await expect(navigation).toBeVisible();
    await expect
      .poll(async () => (await navigation.boundingBox())?.x ?? -1)
      .toBeGreaterThanOrEqual(0);
    await holdForReview();
    await closeNavigation.click();
    await expect
      .poll(async () => (await navigation.boundingBox())?.x ?? 0)
      .toBeLessThan(0);
    await expect(openNavigation).toBeVisible();
    await holdForReview();

    const routeBeforeReload = new URL(page.url()).pathname;
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
      reloadPage.click(),
    ]);
    expect(new URL(page.url()).pathname).toBe(routeBeforeReload);
    await expect(
      page.getByRole('heading', { name: "Teacher's Lounge" })
    ).toBeVisible();
    await expect(openNavigation).toBeVisible();
    await expect(reloadPage).toBeVisible();
    await holdForReview();

    await scanPage(page, testInfo, 'mobile-app-shell-controls');
    const screenshotPath = testInfo.outputPath('mobile-app-shell-controls.png');
    await page.screenshot({ path: screenshotPath });
    await testInfo.attach('mobile-app-shell-controls', {
      path: screenshotPath,
      contentType: 'image/png',
    });
  });

  test('Teacher Lounge pages have no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
    signIn,
    e2eContext,
  }, testInfo) => {
    test.slow();
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app/teacher-trainings');
    await expect(
      page.getByRole('heading', { name: "Teacher's Lounge" })
    ).toBeVisible();
    await scanPage(page, testInfo, 'teacher-lounge-index');

    await page.goto(`/app/teacher-trainings/${e2eContext.teacherTrainingId}`);
    await expect(
      page.getByRole('heading', { name: 'E2E Teacher Lounge' })
    ).toBeVisible();
    await scanPage(page, testInfo, 'teacher-lounge-course');

    await page
      .getByRole('link', { name: /E2E Lounge Module/i })
      .first()
      .click();
    await expect(
      page.getByRole('heading', { name: 'E2E Lounge Module' })
    ).toBeVisible();
    await scanPage(page, testInfo, 'teacher-lounge-module');

    const moduleActions = page.getByRole('button', {
      name: 'Module actions for E2E Lounge Module',
    });
    await moduleActions.focus();
    await expect(moduleActions).toBeFocused();
    await page.keyboard.press('Enter');

    const restartModuleItem = page.getByRole('menuitem', {
      name: 'Restart Module',
    });
    const moduleActionsMenu = page.getByRole('menu');
    await expect(restartModuleItem).toBeVisible();
    await expect(restartModuleItem).toBeFocused();
    await moduleActionsMenu.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished)
      );
    });
    await scanPage(page, testInfo, 'teacher-lounge-module-actions-open');
    const desktopScreenshotPath = testInfo.outputPath(
      'teacher-lounge-module-actions-desktop.png'
    );
    await page.screenshot({ path: desktopScreenshotPath });
    await testInfo.attach('teacher-lounge-module-actions-desktop', {
      path: desktopScreenshotPath,
      contentType: 'image/png',
    });
    await restartModuleItem.focus();
    await expect(restartModuleItem).toBeFocused();

    const [restartRequest] = await Promise.all([
      page.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          request.postData()?.includes('restartModule') === true
      ),
      restartModuleItem.press('Enter'),
    ]);
    const restartResponse = await restartRequest.response();
    if (!restartResponse) {
      throw new Error('Restart Module POST completed without a response');
    }
    expect(restartResponse.status()).toBeLessThan(400);
    await expect(restartModuleItem).toBeHidden();
    await expect(
      page.getByRole('heading', { name: 'E2E Lounge Module' }).first()
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await moduleActions.focus();
    await expect(moduleActions).toBeFocused();
    await moduleActions.press('Enter');
    await expect(restartModuleItem).toBeVisible();
    await moduleActionsMenu.evaluate(async (node) => {
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished)
      );
    });
    await scanPage(page, testInfo, 'teacher-lounge-module-actions-open-mobile');
    const mobileScreenshotPath = testInfo.outputPath(
      'teacher-lounge-module-actions-mobile.png'
    );
    await page.screenshot({ path: mobileScreenshotPath });
    await testInfo.attach('teacher-lounge-module-actions-mobile', {
      path: mobileScreenshotPath,
      contentType: 'image/png',
    });
    await page.keyboard.press('Escape');
    await expect(restartModuleItem).toBeHidden();
  });

  test('teacher grading view has no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
    signIn,
    e2eContext,
  }, testInfo) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('submission-title-input')).toHaveValue(
      'E2E Essay submission title'
    );

    await scanPage(page, testInfo, 'teacher-grading-view');
  });
});
