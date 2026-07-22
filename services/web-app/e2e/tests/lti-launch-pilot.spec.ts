import { test, expect } from '../test-setup';
import AxeBuilder from '@axe-core/playwright';
import type { Page, TestInfo } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createE2EPrismaClient } from '../prisma-client';
import {
  startMockLtiPlatform,
  type MockLtiPlatform,
} from '../mocks/lti/mock-lti-platform';

const APP_BASE_URL = 'http://127.0.0.1:5174';
const REGISTRATION_ID = 'e2e-lti-launch-registration';

let platform: MockLtiPlatform;
let organizationId: string;
let classId: string;
let classLabel: string;

async function expectNoBlockingAccessibilityViolations(
  page: Page,
  testInfo: TestInfo,
  label: string
) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations.filter(
    ({ impact }) => impact === 'critical' || impact === 'serious'
  );
  await testInfo.attach(`${label}-axe.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });
  expect(blocking, `${label} has blocking accessibility violations`).toEqual(
    []
  );
}

async function holdForVideoReview(page: Page) {
  if (process.env.E2E_VIDEO === 'on') {
    await page.waitForTimeout(5_000);
  }
}

function loadE2eEnvironment() {
  const e2eDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..'
  );
  for (const line of fs
    .readFileSync(path.join(e2eDirectory, '.env.e2e'), 'utf8')
    .split('\n')) {
    if (!line) continue;
    const separator = line.indexOf('=');
    if (separator > 0) {
      process.env[line.slice(0, separator)] = line.slice(separator + 1);
    }
  }
}

test.describe.serial('secure LTI launch pilot', () => {
  test.beforeAll(async () => {
    loadE2eEnvironment();
    platform = await startMockLtiPlatform({
      toolBaseUrl: APP_BASE_URL,
      nowSeconds: Math.floor(Date.now() / 1000),
    });
    const prisma = createE2EPrismaClient();
    try {
      const organization = await prisma.organization.findFirstOrThrow({
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      const classRecord = await prisma.class.findFirstOrThrow({
        where: { school: { organizationId: organization.id } },
        orderBy: { createdAt: 'asc' },
        select: { id: true, title: true, code: true },
      });
      organizationId = organization.id;
      classId = classRecord.id;
      classLabel = classRecord.title ?? classRecord.code;
      await prisma.organization.update({
        where: { id: organizationId },
        data: { ltiEnabled: true },
      });
      await prisma.ltiRegistration.create({
        data: {
          id: REGISTRATION_ID,
          organizationId,
          provider: platform.registration.provider,
          displayName: 'Blackboard browser pilot',
          issuer: platform.registration.issuer,
          clientId: platform.registration.clientId,
          deploymentId: platform.registration.deploymentId,
          authorizationEndpoint: platform.registration.authorizationEndpoint,
          tokenEndpoint: platform.registration.tokenEndpoint,
          jwksUrl: platform.registration.jwksUrl,
          loginInitiationUrl: platform.registration.loginInitiationUrl,
          launchUrl: platform.registration.launchUrl,
          deepLinkingLaunchUrl: platform.registration.deepLinkingLaunchUrl,
          toolJwksUrl: platform.registration.toolJwksUrl,
          allowedAudiences: platform.registration.allowedAudiences,
          allowedServiceOrigins: platform.registration.allowedServiceOrigins,
          allowedTargetLinkUris: platform.registration.allowedTargetLinkUris,
          enabledScopes: platform.registration.enabledScopes,
          jwksCacheTtlSeconds: platform.registration.jwksCacheTtlSeconds,
          enabled: true,
        },
      });
      await prisma.ltiCourseMapping.create({
        data: {
          registrationId: REGISTRATION_ID,
          organizationId,
          contextId: platform.seed.context.id,
          classId,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    await platform?.close();
  });

  async function beginLaunch(page: Page, scenario: string, submit = true) {
    await page.goto(
      `${platform.baseUrl}/browser/launch?scenario=${encodeURIComponent(scenario)}`
    );
    await expect(
      page.getByRole('heading', { name: 'Mock LMS course' })
    ).toBeVisible();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: 'Open Yawp in a new window' }).click();
    const toolPage = await popupPromise;
    await expect(toolPage.locator('form')).toHaveAttribute(
      'action',
      `${APP_BASE_URL}/lti/launch`
    );
    const form = {
      idToken: await toolPage.locator('input[name="id_token"]').inputValue(),
      state: await toolPage.locator('input[name="state"]').inputValue(),
    };
    if (submit) {
      await toolPage
        .locator('form')
        .evaluate((element) => (element as HTMLFormElement).submit());
    }
    return { form, toolPage };
  }

  async function signInFromLaunch(page: Page, email: string, password: string) {
    await page.waitForURL((url) => url.pathname === '/auth/login');
    expect(new URL(page.url()).searchParams.get('redirectTo')).toBe(
      '/lti/link'
    );
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole('button', { name: /log in/i }).click();
    await page.waitForURL((url) => url.pathname === '/lti/link');
  }

  test('rejects embedded presentation before creating launch data', async ({
    page,
  }) => {
    const prisma = createE2EPrismaClient();
    try {
      const before = await prisma.$transaction([
        prisma.ltiLaunchTransaction.count({
          where: { registrationId: REGISTRATION_ID },
        }),
        prisma.ltiAuditEvent.count({
          where: { registrationId: REGISTRATION_ID },
        }),
      ]);
      await page.goto(
        `${platform.baseUrl}/browser/iframe-launch?scenario=instructor-resource-link`
      );
      const frame = page.frameLocator('iframe[title="Yawp embedded launch"]');
      await expect(
        frame.getByRole('heading', {
          name: "We couldn't open Yawp from your LMS",
          level: 1,
        })
      ).toBeVisible();
      const after = await prisma.$transaction([
        prisma.ltiLaunchTransaction.count({
          where: { registrationId: REGISTRATION_ID },
        }),
        prisma.ltiAuditEvent.count({
          where: { registrationId: REGISTRATION_ID },
        }),
      ]);
      expect(after).toEqual(before);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('rejects a valid form transferred to a second browser context', async ({
    page,
    browser,
  }) => {
    const launch = await beginLaunch(page, 'instructor-resource-link', false);
    const secondContext = await browser.newContext();
    try {
      const transferred = await secondContext.request.post(
        `${APP_BASE_URL}/lti/launch`,
        {
          form: {
            id_token: launch.form.idToken,
            state: launch.form.state,
          },
          maxRedirects: 0,
        }
      );
      expect(transferred.status()).toBe(303);
      expect(transferred.headers().location).toBe('/lti/error');

      await launch.toolPage
        .locator('form')
        .evaluate((element) => (element as HTMLFormElement).submit());
      await launch.toolPage.waitForURL((url) => url.pathname === '/auth/login');
    } finally {
      await secondContext.close();
      await launch.toolPage.close();
    }
  });

  test('teacher explicitly links, reaches the mapped class, and replay fails generically', async ({
    page,
    e2eContext,
  }, testInfo) => {
    const first = await beginLaunch(page, 'instructor-resource-link');
    const firstForm = first.form;
    const toolPage = first.toolPage;
    await signInFromLaunch(
      toolPage,
      e2eContext.teacherEmail,
      'teacher-e2e-password'
    );

    await expect(
      toolPage.getByRole('heading', {
        name: 'Connect this LMS identity?',
        level: 1,
      })
    ).toBeVisible();
    await expect(toolPage.getByText('The Connell School')).toBeVisible();
    await expect(toolPage.getByText('Teacher', { exact: true })).toBeVisible();
    await expect(toolPage.locator('body')).not.toContainText(
      'kevin.instructor@example.test'
    );
    await expectNoBlockingAccessibilityViolations(
      toolPage,
      testInfo,
      'lti-link-confirmation'
    );
    await holdForVideoReview(toolPage);
    await toolPage
      .getByRole('button', { name: 'Connect and open course' })
      .click();
    await toolPage.waitForURL(`**/app/my-classes/${classId}`);
    await holdForVideoReview(toolPage);

    const replay = await toolPage.request.post(`${APP_BASE_URL}/lti/launch`, {
      form: { id_token: firstForm.idToken, state: firstForm.state },
      maxRedirects: 0,
    });
    expect(replay.status()).toBe(303);
    expect(replay.headers().location).toBe('/lti/error');

    await toolPage.goto('/lti/error');
    await expect(
      toolPage.getByRole('heading', {
        name: "We couldn't open Yawp from your LMS",
        level: 1,
      })
    ).toBeVisible();
    await expectNoBlockingAccessibilityViolations(
      toolPage,
      testInfo,
      'lti-generic-error'
    );
    await holdForVideoReview(toolPage);

    const second = await beginLaunch(page, 'instructor-resource-link');
    expect(second.form.state).not.toBe(firstForm.state);
    await second.toolPage.waitForURL(`**/app/my-classes/${classId}`);
  });

  test('learner explicitly links to the mapped class and reaches the student workspace', async ({
    page,
    e2eContext,
  }) => {
    const launch = await beginLaunch(page, 'learner-resource-link-no-pii');
    const toolPage = launch.toolPage;
    await signInFromLaunch(toolPage, e2eContext.userEmail, 'johndoe');
    await expect(toolPage.getByText('Student', { exact: true })).toBeVisible();
    await expect(toolPage.locator('body')).not.toContainText('@');
    await holdForVideoReview(toolPage);
    await toolPage
      .getByRole('button', { name: 'Connect and open course' })
      .click();
    await toolPage.waitForURL(
      (url) =>
        url.pathname === '/app' &&
        url.searchParams.get('ltiClassId') === classId
    );
    await expect(
      toolPage.getByText(
        `Opened from your LMS for ${classLabel}. Only this mapped class is shown.`
      )
    ).toBeVisible();
    await holdForVideoReview(toolPage);

    const prisma = createE2EPrismaClient();
    try {
      const identities = await prisma.ltiExternalIdentity.findMany({
        where: { registrationId: REGISTRATION_ID },
        select: { subjectHash: true },
      });
      expect(identities).toHaveLength(2);
      expect(JSON.stringify(identities)).not.toContain('lti-');
      expect(
        identities.every(({ subjectHash }) => subjectHash.length === 64)
      ).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
  });

  test('admin diagnostics remain usable at a narrow mobile viewport', async ({
    page,
    signIn,
  }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn('admin.e2e@yawp.test', 'admin-e2e-password');
    await page.goto(`/app/admin/organizations/${organizationId}/lti`);
    await expect(
      page.getByRole('heading', { name: 'Organization LTI access' })
    ).toBeVisible();
    await expect(page.getByText('Blackboard browser pilot')).toBeVisible();
    await page
      .getByText('Review registration diagnostics', { exact: true })
      .click();
    await expect(
      page.getByText(platform.registration.issuer, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText(platform.registration.clientId, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByText(platform.registration.jwksUrl, { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Course mappings' })
    ).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'kevin.instructor@example.test'
    );
    await expectNoBlockingAccessibilityViolations(
      page,
      testInfo,
      'lti-mobile-admin-diagnostics'
    );
    await holdForVideoReview(page);
  });
});
