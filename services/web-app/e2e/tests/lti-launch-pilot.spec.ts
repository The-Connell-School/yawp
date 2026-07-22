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
        select: { id: true },
      });
      organizationId = organization.id;
      classId = classRecord.id;
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

  async function beginLaunch(page: Page, scenario: string) {
    const parameters = new URLSearchParams({
      iss: platform.registration.issuer,
      client_id: platform.registration.clientId,
      lti_deployment_id: platform.registration.deploymentId,
      login_hint: `opaque-${scenario}`,
      lti_message_hint: scenario,
      target_link_uri: platform.registration.launchUrl,
    });
    await page.goto(`/lti/login?${parameters}`);
    await expect(page.locator('form')).toHaveAttribute(
      'action',
      `${APP_BASE_URL}/lti/launch`
    );
    const form = {
      idToken: await page.locator('input[name="id_token"]').inputValue(),
      state: await page.locator('input[name="state"]').inputValue(),
    };
    await page
      .locator('form')
      .evaluate((element) => (element as HTMLFormElement).submit());
    return form;
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

  test('teacher explicitly links, reaches the mapped class, and replay fails generically', async ({
    page,
    e2eContext,
  }, testInfo) => {
    const firstForm = await beginLaunch(page, 'instructor-resource-link');
    await signInFromLaunch(
      page,
      e2eContext.teacherEmail,
      'teacher-e2e-password'
    );

    await expect(
      page.getByRole('heading', { name: 'Connect this LMS identity?' })
    ).toBeVisible();
    await expect(page.getByText('The Connell School')).toBeVisible();
    await expect(page.getByText('Teacher', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(
      'kevin.instructor@example.test'
    );
    await expectNoBlockingAccessibilityViolations(
      page,
      testInfo,
      'lti-link-confirmation'
    );
    await holdForVideoReview(page);
    await page.getByRole('button', { name: 'Connect and open course' }).click();
    await page.waitForURL(`**/app/my-classes/${classId}`);
    await holdForVideoReview(page);

    const replay = await page.request.post(`${APP_BASE_URL}/lti/launch`, {
      form: { id_token: firstForm.idToken, state: firstForm.state },
      maxRedirects: 0,
    });
    expect(replay.status()).toBe(303);
    expect(replay.headers().location).toBe('/lti/error');

    await page.goto('/lti/error');
    await expect(
      page.getByRole('heading', {
        name: "We couldn't open Yawp from your LMS",
      })
    ).toBeVisible();
    await expectNoBlockingAccessibilityViolations(
      page,
      testInfo,
      'lti-generic-error'
    );
    await holdForVideoReview(page);

    const second = await beginLaunch(page, 'instructor-resource-link');
    expect(second.state).not.toBe(firstForm.state);
    await page.waitForURL(`**/app/my-classes/${classId}`);
  });

  test('learner explicitly links to the mapped class and reaches the student workspace', async ({
    page,
    e2eContext,
  }) => {
    await beginLaunch(page, 'learner-resource-link-no-pii');
    await signInFromLaunch(page, e2eContext.userEmail, 'johndoe');
    await expect(page.getByText('Student', { exact: true })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('@');
    await holdForVideoReview(page);
    await page.getByRole('button', { name: 'Connect and open course' }).click();
    await page.waitForURL((url) => url.pathname === '/app');
    await expect(page.getByText('E2E Course')).toBeVisible();
    await holdForVideoReview(page);

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
