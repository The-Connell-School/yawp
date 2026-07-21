import type { Page, TestInfo } from '@playwright/test';
import { test, expect } from '../test-setup';
import { EDITOR_SELECTOR } from '../test-helpers';
import { createE2EPrismaClient } from '../prisma-client';

const STUDENT_PASSWORD = 'johndoe';
const TEACHER_PASSWORD = 'teacher-e2e-password';
const ADMIN_PASSWORD = 'admin-e2e-password';

const RESOURCE_NAMES = [
  'ua-evidence-handout.pdf',
  'ua-evidence-captions.vtt',
  'ua-evidence-transcript.md',
];

type FocusStop = {
  index: number;
  tagName: string;
  role: string | null;
  label: string | null;
  text: string;
  href: string | null;
  visible: boolean;
};

async function collectTabStops(
  page: Page,
  testInfo: TestInfo,
  label: string,
  minimumUniqueStops: number
) {
  await page.keyboard.press('Escape').catch(() => undefined);

  const stops: FocusStop[] = [];
  for (let index = 0; index < 45; index++) {
    await page.keyboard.press('Tab');
    await page.waitForTimeout(25);
    const stop = await page.evaluate((currentIndex) => {
      const element = document.activeElement as HTMLElement | null;
      if (!element || element === document.body) return null;
      const rect = element.getBoundingClientRect();
      const labelledBy = element.getAttribute('aria-labelledby');
      const labelledByText = labelledBy
        ? labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent?.trim())
            .filter(Boolean)
            .join(' ')
        : '';

      return {
        index: currentIndex,
        tagName: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        label:
          element.getAttribute('aria-label') ||
          labelledByText ||
          element.getAttribute('name') ||
          element.getAttribute('placeholder'),
        text: (element.innerText || element.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 120),
        href:
          element instanceof HTMLAnchorElement ? element.getAttribute('href') : null,
        visible:
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth,
      };
    }, index);

    if (stop) stops.push(stop);
  }

  const uniqueStops = new Set(
    stops.map(
      (stop) =>
        `${stop.tagName}:${stop.role ?? ''}:${stop.label ?? ''}:${stop.text}:${stop.href ?? ''}`
    )
  );

  await testInfo.attach(`${label}-tab-stops.json`, {
    body: JSON.stringify(stops, null, 2),
    contentType: 'application/json',
  });

  expect(
    uniqueStops.size,
    `${label} should expose keyboard-reachable controls without trapping focus`
  ).toBeGreaterThanOrEqual(minimumUniqueStops);

  expect(
    stops.filter((stop) => stop.visible).length,
    `${label} should keep focused controls visible in the viewport`
  ).toBeGreaterThanOrEqual(minimumUniqueStops);
}

async function expectNoDocumentHorizontalScroll(
  page: Page,
  testInfo: TestInfo,
  label: string
) {
  const measurement = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      viewportWidth: window.innerWidth,
      rootClientWidth: root.clientWidth,
      rootScrollWidth: root.scrollWidth,
      bodyClientWidth: body.clientWidth,
      bodyScrollWidth: body.scrollWidth,
    };
  });

  await testInfo.attach(`${label}-reflow.json`, {
    body: JSON.stringify(measurement, null, 2),
    contentType: 'application/json',
  });

  expect(
    Math.max(measurement.rootScrollWidth, measurement.bodyScrollWidth),
    `${label} should not force document-level horizontal scrolling`
  ).toBeLessThanOrEqual(measurement.rootClientWidth + 2);
}

async function seedTeacherLoungeResources(teacherTrainingId: string) {
  const prisma = createE2EPrismaClient();
  try {
    const module = await prisma.teacherTrainingModule.findFirstOrThrow({
      where: {
        teacherTrainingId,
        title: 'E2E Lounge Module',
      },
      select: { id: true },
    });

    await prisma.teacherTrainingModuleResource.deleteMany({
      where: {
        teacherTrainingModuleId: module.id,
        name: { in: RESOURCE_NAMES },
      },
    });

    await prisma.teacherTrainingModuleResource.createMany({
      data: [
        {
          teacherTrainingModuleId: module.id,
          name: 'ua-evidence-handout.pdf',
          contentType: 'application/pdf',
          blob: Buffer.from('UA evidence handout'),
        },
        {
          teacherTrainingModuleId: module.id,
          name: 'ua-evidence-captions.vtt',
          contentType: 'text/vtt',
          blob: Buffer.from(
            'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nCaption evidence.\n'
          ),
        },
        {
          teacherTrainingModuleId: module.id,
          name: 'ua-evidence-transcript.md',
          contentType: 'text/markdown',
          blob: Buffer.from('# Transcript\n\nTranscript evidence.\n'),
        },
      ],
    });

    return module.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe.serial('UA manual accessibility evidence automation', () => {
  test('keyboard-only smoke covers public, login, and student editor flows', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }, testInfo) => {
    await page.goto('/accessibility');
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).toBeVisible();
    await expect(
      page
        .locator('#report')
        .getByRole('link', { name: 'yawp@theconnellschool.com' })
    ).toBeVisible();
    await collectTabStops(page, testInfo, 'public-accessibility', 3);

    await page.goto('/auth/login');
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await collectTabStops(page, testInfo, 'auth-login', 4);

    await page.getByLabel('Email').fill(e2eContext.userEmail);
    await page.getByLabel('Password').fill(STUDENT_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).focus();
    await page.keyboard.press('Enter');
    await page.waitForURL('**/app**', { timeout: 15000 });

    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    const editor = page.locator(EDITOR_SELECTOR).first();
    await expect(editor).toBeVisible();
    await editor.focus();
    await page.keyboard.type(' UA keyboard evidence.');
    await expect(editor).toContainText('UA keyboard evidence');
    await collectTabStops(page, testInfo, 'student-editor', 8);
  });

  test('keyboard-only smoke covers teacher, grading, Teacher Lounge, and admin flows', async ({
    page,
    signIn,
    e2eContext,
  }, testInfo) => {
    const moduleId = await seedTeacherLoungeResources(
      e2eContext.teacherTrainingId
    );

    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app');
    await expect(page.getByTestId('app._index')).toBeVisible();
    await collectTabStops(page, testInfo, 'teacher-dashboard', 8);

    await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('submission-title-input')).toHaveValue(
      'E2E Essay submission title'
    );
    await collectTabStops(page, testInfo, 'teacher-grading', 8);

    await page.goto(`/app/teacher-trainings/${e2eContext.teacherTrainingId}`);
    await expect(
      page.getByRole('heading', { name: 'E2E Teacher Lounge' })
    ).toBeVisible();
    const moduleLink = page
      .getByRole('link', { name: /E2E Lounge Module/i })
      .first();
    await moduleLink.focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(`**/modules/${moduleId}`);
    await expect(
      page.getByRole('heading', { name: 'E2E Lounge Module' }).first()
    ).toBeVisible();
    await expect(
      page.getByTestId('teacher-training-media-accessibility')
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /^captions$/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^transcript$/i })).toBeVisible();
    await collectTabStops(page, testInfo, 'teacher-lounge-module', 8);

    await page.context().clearCookies();
    await signIn(e2eContext.adminEmail, ADMIN_PASSWORD);
    await page.goto('/app/organization');
    await page.waitForURL('**/app/organization/classes');
    await expect(
      page.getByRole('heading', { name: 'The Connell School' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Classes', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Schools', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Teachers', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Students', exact: true })
    ).toBeVisible();
    await collectTabStops(page, testInfo, 'admin-organization', 6);

    await page.goto(`/app/admin/assignment-types/${e2eContext.assignmentTypeId}`);
    await expect(
      page.getByRole('heading', { name: 'Edit assignment type' })
    ).toBeVisible();
    await collectTabStops(page, testInfo, 'admin-assignment-type', 6);
  });

  test('200% zoom/reflow proxy avoids document-level horizontal scroll', async ({
    page,
    signIn,
    e2eContext,
    helpers,
  }, testInfo) => {
    const moduleId = await seedTeacherLoungeResources(
      e2eContext.teacherTrainingId
    );
    await page.setViewportSize({ width: 640, height: 900 });

    await page.goto('/accessibility');
    await expectNoDocumentHorizontalScroll(
      page,
      testInfo,
      'public-accessibility-200-percent'
    );

    await page.goto('/auth/login');
    await expectNoDocumentHorizontalScroll(page, testInfo, 'login-200-percent');

    await signIn(e2eContext.userEmail, STUDENT_PASSWORD);
    await helpers.openDocument(e2eContext.editedDocumentId, { retry: true });
    await expectNoDocumentHorizontalScroll(
      page,
      testInfo,
      'student-editor-200-percent'
    );

    await page.context().clearCookies();
    await signIn(e2eContext.teacherEmail, TEACHER_PASSWORD);
    await page.goto('/app');
    await expectNoDocumentHorizontalScroll(
      page,
      testInfo,
      'teacher-dashboard-200-percent'
    );

    await page.goto(`/app/submissions/${e2eContext.submittedSubmissionId}`);
    await page.waitForLoadState('networkidle');
    await expectNoDocumentHorizontalScroll(
      page,
      testInfo,
      'teacher-grading-200-percent'
    );

    await page.goto(
      `/app/teacher-trainings/${e2eContext.teacherTrainingId}/modules/${moduleId}`
    );
    await expectNoDocumentHorizontalScroll(
      page,
      testInfo,
      'teacher-lounge-200-percent'
    );
  });
});
