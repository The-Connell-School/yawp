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

  test('Teacher Lounge pages have no serious or critical WCAG 2.1 A/AA violations', async ({
    page,
    signIn,
    e2eContext,
  }, testInfo) => {
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
