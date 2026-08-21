import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { chromium, expect, type Page } from '@playwright/test';
import { submissionActivityUiContract } from '../app/domain/submissions/submission-activity-ui-contract';

const baseUrl = process.env.PROD_QA_BASE_URL ?? 'https://yawp.school';
const password = process.env.PROD_QA_PASSWORD;
const submissionPath = '/app/submissions/prod-qa-v3-released-submission';

if (!password || password.length < 12) {
  throw new Error('PROD_QA_PASSWORD must be configured for production QA.');
}

async function signIn(page: Page, email: string) {
  await page.goto(`${baseUrl}/auth/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((url) => url.pathname.startsWith('/app'), {
    timeout: 20_000,
  });
}

const browser = await chromium.launch();
try {
  const teacherContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: resolve('test-results/production-video'),
      size: { width: 1440, height: 900 },
    },
  });
  const teacherPage = await teacherContext.newPage();
  const teacherVideo = teacherPage.video();
  const walkthroughStartedAt = performance.now();
  const walkthroughSteps: Array<{ step: string; seconds: number }> = [];
  const markWalkthroughStep = (step: string) => {
    walkthroughSteps.push({
      step,
      seconds: Number(
        ((performance.now() - walkthroughStartedAt) / 1000).toFixed(3)
      ),
    });
  };
  await signIn(teacherPage, 'prod.qa.teacher.v3@brock.software');
  await teacherPage.goto(`${baseUrl}${submissionPath}`);
  await expect(
    teacherPage.getByTestId('submission-lifecycle-edit')
  ).toBeVisible();
  await expect(
    teacherPage.getByTestId(submissionActivityUiContract.triggerTestId)
  ).toBeVisible();
  markWalkthroughStep('teacher_released_view');

  await teacherPage.getByTestId('submission-lifecycle-edit').click();
  await expect(
    teacherPage.getByTestId('released-grade-edit-warning')
  ).toBeVisible();
  markWalkthroughStep('released_edit_warning');
  const warningScreenshotPath = resolve(
    'test-results/production-released-grade-edit-warning.png'
  );
  await mkdir(dirname(warningScreenshotPath), { recursive: true });
  await teacherPage.screenshot({
    path: warningScreenshotPath,
    fullPage: true,
  });
  await teacherPage.waitForTimeout(2_000);
  await teacherPage.getByTestId('grading-overall-percentage').fill('91');
  await teacherPage
    .getByTestId('grading-overall-comment')
    .fill('Production QA verified released-grade feedback.');
  await teacherPage.getByTestId('submission-lifecycle-save').click();
  await expect(
    teacherPage.getByTestId('submission-lifecycle-edit')
  ).toBeVisible();
  markWalkthroughStep('released_grade_saved');
  await teacherPage.waitForTimeout(1_500);

  await teacherPage
    .getByTestId(submissionActivityUiContract.triggerTestId)
    .click();
  const activityPanel = teacherPage.getByTestId(
    submissionActivityUiContract.panelTestId
  );
  await expect(
    activityPanel.getByText(submissionActivityUiContract.gradeUpdatedLabel)
  ).toBeVisible();
  await expect(
    activityPanel
      .getByTestId(submissionActivityUiContract.afterReleaseTestId)
      .first()
  ).toBeVisible();
  await expect(activityPanel).toContainText('77');
  await expect(activityPanel).toContainText('91');
  markWalkthroughStep('activity_exact_before_after');
  // Radix marks the Sheet content visible before its entrance transition has
  // finished. Let the production proof capture the settled audit panel rather
  // than a translated off-screen frame.
  await teacherPage.waitForTimeout(2_500);

  const screenshotPath = resolve(
    'test-results/production-released-grade-activity.png'
  );
  await mkdir(dirname(screenshotPath), { recursive: true });
  await teacherPage.screenshot({ path: screenshotPath, fullPage: true });

  // Keep the student-negative verification in the same recorded walkthrough,
  // so the video proves both the teacher capability and the student boundary.
  await teacherContext.clearCookies();
  await signIn(teacherPage, 'prod.qa.student.v3@brock.software');
  await teacherPage.goto(`${baseUrl}${submissionPath}`);
  await expect(teacherPage.getByText('91%')).toBeVisible();
  await expect(
    teacherPage.getByText('Production QA verified released-grade feedback.')
  ).toBeVisible();
  await expect(
    teacherPage.getByTestId('submission-lifecycle-edit')
  ).toHaveCount(0);
  await expect(
    teacherPage.getByTestId(submissionActivityUiContract.triggerTestId)
  ).toHaveCount(0);
  markWalkthroughStep('student_current_grade_without_staff_controls');
  await teacherPage.waitForTimeout(2_000);
  await writeFile(
    resolve('test-results/production-released-grade-walkthrough-steps.json'),
    `${JSON.stringify({ steps: walkthroughSteps }, null, 2)}\n`
  );
  await teacherContext.close();
  await teacherVideo?.saveAs(
    resolve('test-results/production-released-grade-walkthrough.webm')
  );

  const mobileTeacherContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const mobileTeacherPage = await mobileTeacherContext.newPage();
  await signIn(mobileTeacherPage, 'prod.qa.teacher.v3@brock.software');
  await mobileTeacherPage.goto(`${baseUrl}${submissionPath}`);
  await mobileTeacherPage
    .getByTestId(submissionActivityUiContract.triggerTestId)
    .click();
  const mobileActivityPanel = mobileTeacherPage.getByTestId(
    submissionActivityUiContract.panelTestId
  );
  await expect(mobileActivityPanel).toContainText('77');
  await expect(mobileActivityPanel).toContainText('91');
  await mobileTeacherPage.waitForTimeout(600);
  await mobileTeacherPage.screenshot({
    path: resolve('test-results/production-released-grade-activity-mobile.png'),
    fullPage: true,
  });
  await mobileTeacherContext.close();

  const studentContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const studentPage = await studentContext.newPage();
  await signIn(studentPage, 'prod.qa.student.v3@brock.software');
  await studentPage.goto(`${baseUrl}${submissionPath}`);
  await expect(studentPage.getByText('91%')).toBeVisible();
  await expect(
    studentPage.getByText('Production QA verified released-grade feedback.')
  ).toBeVisible();
  await expect(
    studentPage.getByTestId('submission-lifecycle-edit')
  ).toHaveCount(0);
  await expect(
    studentPage.getByTestId(submissionActivityUiContract.triggerTestId)
  ).toHaveCount(0);
  await studentPage.screenshot({
    path: resolve('test-results/production-released-grade-student-mobile.png'),
    fullPage: true,
  });
  await studentContext.close();
  console.log('Production released-grade activity QA passed.');
} finally {
  await browser.close();
}
