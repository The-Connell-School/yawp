import { createCookieSessionStorage } from 'react-router';
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import { provisionFreeClassroomForE2E } from '../helpers/provision-free-classroom-for-e2e';
import { seedSiteLicenseLockedCatalogForE2E } from '../helpers/seed-site-license-locked-catalog-for-e2e';
import { dashboardAssignmentTileOverlapIssues } from '../helpers/dashboard-assignment-tile-overlap';
import { expectGiveFeedbackAccessible } from '../helpers/dev-panel-feedback';
if (!process.env.CLASS_STEP_PORT) {
  throw new Error(
    'Run class-step tests with ./bin/project test --profile free-tier-locked-preview-browser'
  );
}
process.env.E2E_DATABASE_URL ??= process.env.DATABASE_URL;
const prisma = createE2EPrismaClient();
const shots = process.env.LOCKED_PREVIEW_EVIDENCE_DIR;
const users: string[] = [];
const apps: string[] = [];
const flagName = 'feature_flag.free_tier';

async function flag(enabled: boolean) {
  await prisma.setting.upsert({
    where: { name: flagName },
    create: { name: flagName, value: String(enabled), valueType: 'boolean' },
    update: { value: String(enabled) },
  });
}

async function demoFeedbackFlag(enabled: boolean) {
  const name = 'feature_flag.demo-feedback-widget';
  await prisma.setting.upsert({
    where: { name },
    create: { name, value: String(enabled), valueType: 'boolean' },
    update: { value: String(enabled) },
  });
}

async function fixture(
  gradeLevel = '11',
  status: 'ACCOUNT_CREATED' | 'SENT' | 'MANUAL_REVIEW' = 'ACCOUNT_CREATED'
) {
  const user = await prisma.user.create({
    data: {
      email: `locked-preview-${crypto.randomUUID()}@example.edu`,
      name: 'Grace Okafor',
    },
  });
  users.push(user.id);
  const app = await prisma.freeTierApplication.create({
    data: {
      userId: user.id,
      email: user.email!,
      name: user.name!,
      schoolName: 'Lincoln High',
      location: 'Local',
      gradeLevel,
      status,
    },
  });
  apps.push(app.id);
  if (status === 'SENT') {
    await prisma.freeTierAdminApproval.create({
      data: {
        applicationId: app.id,
        adminName: 'Dr. Patel',
        adminEmail: 'principal@example.test',
        emailCopyVersionHash: 'local-locked-preview',
        firstSentAt: new Date('2026-10-14T15:00:00Z'),
      },
    });
  }
  return { user, app };
}

async function expectLockedAppHome(page: import('@playwright/test').Page) {
  await expect(page).toHaveURL(/\/app\/?$/);
}

async function login(page: import('@playwright/test').Page, email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const session = await prisma.session.create({
    data: { userId: user.id, expirationDate: new Date(Date.now() + 3600000) },
  });
  const storage = createCookieSessionStorage({
    cookie: {
      name: 'en_session',
      secrets: process.env.SESSION_SECRET!.split(','),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
  const cookie = await storage.getSession();
  cookie.set('sessionId', session.id);
  const value = (await storage.commitSession(cookie))
    .split(';')[0]
    .slice('en_session='.length);
  await page.context().addCookies([
    {
      name: 'en_session',
      value,
      url: new URL(
        page.url() === 'about:blank'
          ? `http://localhost:${process.env.CLASS_STEP_PORT}`
          : page.url()
      ).origin,
    },
  ]);
}

async function provisionPendingClassroom(appId: string, userId: string) {
  provisionFreeClassroomForE2E(appId);
  const app = await prisma.freeTierApplication.findUniqueOrThrow({
    where: { id: appId },
    select: { organizationId: true },
  });
  expect(app.organizationId).toBeTruthy();
  await prisma.orgMembership.findFirstOrThrow({
    where: { userId, organizationId: app.organizationId! },
  });
}

const pr655FinalDir = '/cursor/stores/self/artifacts/screenshots/pr655-final';
const artifactScreenshotDir = '/opt/cursor/artifacts/screenshots';

async function expectTileNamesWrapOnWordBoundaries(
  page: import('@playwright/test').Page,
  root?: import('@playwright/test').Locator
) {
  const violations = root
    ? await root.evaluate((scope) => {
        const nodes = scope.querySelectorAll(
          '[data-testid="assignment-type-tile-name"]'
        );
        const issues: string[] = [];
        for (const node of nodes) {
          const el = node as HTMLElement;
          const text = el.textContent ?? '';
          const words = text.trim().split(/\s+/).filter(Boolean);
          const textNode = el.firstChild;
          if (!words.length || !textNode || textNode.nodeType !== Node.TEXT_NODE) {
            continue;
          }
          for (const word of words) {
            if (word.length < 2) continue;
            const start = text.indexOf(word);
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + word.length);
            if (range.getClientRects().length > 1) {
              issues.push(`mid-word break: "${word}" in "${text}"`);
            }
          }
        }
        return issues;
      })
    : await page.evaluate(() => {
        const nodes = document.querySelectorAll(
          '[data-testid="assignment-type-tile-name"]'
        );
        const issues: string[] = [];
        for (const node of nodes) {
          const el = node as HTMLElement;
          const text = el.textContent ?? '';
          const words = text.trim().split(/\s+/).filter(Boolean);
          const textNode = el.firstChild;
          if (!words.length || !textNode || textNode.nodeType !== Node.TEXT_NODE) {
            continue;
          }
          for (const word of words) {
            if (word.length < 2) continue;
            const start = text.indexOf(word);
            if (start < 0) continue;
            const range = document.createRange();
            range.setStart(textNode, start);
            range.setEnd(textNode, start + word.length);
            if (range.getClientRects().length > 1) {
              issues.push(`mid-word break: "${word}" in "${text}"`);
            }
          }
        }
        return issues;
      });
  expect(violations).toEqual([]);
}

async function expectDashboardAssignmentTileNameMetaNoOverlap(
  page: import('@playwright/test').Page,
  root: import('@playwright/test').Locator
) {
  const violations = await root.evaluate(dashboardAssignmentTileOverlapIssues);
  expect(violations).toEqual([]);
}

async function expectPickerTileNameMetaNoOverlap(
  page: import('@playwright/test').Page,
  listbox: import('@playwright/test').Locator
) {
  const violations = await listbox.evaluate((scope) => {
    const issues: string[] = [];
    const names = scope.querySelectorAll(
      '[data-testid="assignment-type-tile-name"]'
    );
    for (const nameEl of names) {
      const meta = nameEl.parentElement?.querySelector(
        '[data-testid="assignment-type-tile-meta"]'
      ) as HTMLElement | null;
      if (!meta) continue;
      const a = nameEl.getBoundingClientRect();
      const b = meta.getBoundingClientRect();
      const pad = 0.5;
      const intersect =
        a.right > b.left + pad &&
        a.left < b.right - pad &&
        a.bottom > b.top + pad &&
        a.top < b.bottom - pad;
      if (intersect) {
        issues.push(
          `overlap: "${nameEl.textContent ?? ''}" × "${meta.textContent ?? ''}"`
        );
      }
    }
    return issues;
  });
  expect(violations).toEqual([]);
}

async function capture(page: import('@playwright/test').Page, state: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const filename = `${state}-impl.png`;
  const shotPath = path.join(shots, filename);
  await page.screenshot({
    path: shotPath,
    fullPage: true,
    animations: 'disabled',
  });
  try {
    fs.mkdirSync(pr655FinalDir, { recursive: true });
    fs.copyFileSync(shotPath, path.join(pr655FinalDir, `${state}.png`));
  } catch {
    /* Agent store may be read-only in some runners. */
  }
  try {
    fs.mkdirSync(artifactScreenshotDir, { recursive: true });
    fs.copyFileSync(shotPath, path.join(artifactScreenshotDir, `${state}.png`));
  } catch {
    /* Artifact dir may be unavailable in some runners. */
  }
}

async function expectFreeDashboardAssignmentTiles(
  page: import('@playwright/test').Page
) {
  const tiles = page.getByTestId('free-assignment-tiles');
  await expect(tiles.getByTestId('dashboard-assignment-tile')).toHaveCount(3);
  await expect(tiles.getByTestId('site-license-locked-assignment-tile')).toHaveCount(
    0
  );
  await expect(tiles.getByText('Class Starter', { exact: true })).toBeVisible();
  await expect(tiles.getByText('Prewriting', { exact: true })).toBeVisible();
  await expect(tiles.getByText('Thesis Statement', { exact: true })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await seedSiteLicenseLockedCatalogForE2E(prisma);
});

test.beforeEach(async () => {
  await prisma.organization.upsert({
    where: { id: 'default-org' },
    create: {
      id: 'default-org',
      name: 'Local onboarding placeholder',
      plan: 'FREE_CLASSROOM',
    },
    update: { plan: 'FREE_CLASSROOM' },
  });
  await flag(true);
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('yawp-dev-panel'));
});

test.afterAll(async () => {
  await flag(false);
  const applications = await prisma.freeTierApplication.findMany({
    where: { id: { in: apps } },
    select: { organizationId: true },
  });
  const orgIds = applications.flatMap((app) =>
    app.organizationId ? [app.organizationId] : []
  );
  await prisma.freeTierApplication.deleteMany({ where: { id: { in: apps } } });
  await prisma.class.deleteMany({
    where: { school: { organizationId: { in: orgIds } } },
  });
  await prisma.orgMembership.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.school.deleteMany({ where: { organizationId: { in: orgIds } } });
  await prisma.organizationAssignmentType.deleteMany({
    where: { organizationId: { in: orgIds } },
  });
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  await prisma.session.deleteMany({ where: { userId: { in: users } } });
  await prisma.orgMembership.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});

for (const width of [390, 1440]) {
  test(`waiting teacher explores the real app in locked mode at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const { user, app } = await fixture('11', 'SENT');
    await provisionPendingClassroom(app.id, user.id!);
    await login(page, user.email!);
    await page.goto('/app/free-tier/pending');
    await expect(page).toHaveURL(/\/app\/free-tier\/pending$/);
    await expect(page.getByText(/Sent to Dr\. Patel on/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Not the right person?' })
    ).toBeVisible();
    await capture(page, `waiting-${width}`);
    const exploreLink = page.getByRole('link', { name: 'Explore my classroom' });
    await expect(exploreLink).toHaveAttribute('href', '/app');
    await exploreLink.click();
    await expectLockedAppHome(page);
    await expect(page).not.toHaveURL(/free-tier\/preview/);
    await expect(
      page.getByRole('heading', { name: /Look around while you wait/i })
    ).toHaveCount(0);
    await expect(page.locator('[data-tour="preview-content-nav"]')).toHaveCount(
      0
    );
    await expect(
      page.getByRole('heading', { name: 'New assignment' })
    ).toHaveCount(0);
    await expect(page.getByTestId('teaching-access-banner')).toBeVisible();
    await expect(
      page
        .getByTestId('teaching-access-banner')
        .getByText(/Waiting for Dr\. Patel to approve your classroom/)
    ).toBeVisible();
    await capture(page, `locked-app-before-${width}`);
    await expectFreeDashboardAssignmentTiles(page);
    await expectTileNamesWrapOnWordBoundaries(
      page,
      page.getByTestId('free-assignment-tiles')
    );
    await expectDashboardAssignmentTileNameMetaNoOverlap(
      page,
      page.getByTestId('free-assignment-tiles')
    );
    await expect(
      page.getByTestId('free-assignment-tiles').locator('img')
    ).toHaveCount(0);
    await expect(page.getByTestId('free-account-checklist')).toHaveCount(0);
    await expect(page.getByTestId('teacher-grading-grid')).toHaveCount(0);
    await expect(page.getByTestId('preview-assignment-creation-disabled')).toHaveCount(
      0
    );
    if (width === 390) {
      await capture(page, 'dashboard-pending-390');
    }
    if (width === 1440) {
      await capture(page, 'dashboard-pending-1440');
    }
    await page
      .getByRole('link', { name: /New Class Starter assignment/i })
      .click();
    await expect(page).toHaveURL(/\/app\/assignment-types\/[^/]+\/how-it-works$/);
    await expect(page.getByRole('button', { name: 'Prompt Library' })).toHaveCount(
      0
    );
    await expect(page.getByTestId('preview-assignment-creation-disabled')).toHaveCount(
      0
    );
    if (width === 1440) {
      await capture(page, 'locked-class-starter-how-it-works-1440');
    }
    await page.goto('/app');
    await expectFreeDashboardAssignmentTiles(page);
    await page
      .getByRole('link', { name: /New Prewriting assignment/i })
      .click();
    await expect(page).toHaveURL(/\/app\/assignment-types\/[^/]+\/how-it-works$/);
    await page.goto('/app');
    await page
      .getByRole('link', { name: /New Thesis Statement assignment/i })
      .click();
    await expect(page).toHaveURL(/\/app\/assignment-types\/[^/]+\/how-it-works$/);
    const thesisTypeId = page.url().match(/assignment-types\/([^/]+)/)?.[1];
    expect(thesisTypeId).toBeTruthy();
    await page.goto(`/app/assignment-types/${thesisTypeId}`);
    await expect(page).toHaveURL(/\/how-it-works$/);
    await page.goto('/app/reporter');
    await expect(
      page.getByRole('heading', { name: 'Unlocks after approval' })
    ).toBeVisible();
    await expect(page.locator('[data-testid="usage-nav-collapsed-link-reporter-locked"]')).toHaveCount(
      0
    );
    if (width === 1440) {
      await capture(page, 'locked-reporter-unlocks-card-1440');
    }
    await page.goto('/app/lesson-planner');
    await expect(page.getByPlaceholder(/Describe your lesson/i)).toBeVisible();
    if (width === 1440) {
      await capture(page, 'locked-lesson-planner-pending-1440');
    }
    await page.getByRole('link', { name: /Back to dashboard/i }).click();
    await expectLockedAppHome(page);
    await expect(page.getByTestId('preview-assignment-creation-disabled')).toHaveCount(
      0
    );
    if (width === 390) {
      await expect(
        page.getByTestId('teaching-access-banner').getByText(/View status/)
      ).toBeVisible();
      await expect(
        page.getByTestId('teaching-access-banner').getByText(/\.\.\./)
      ).toHaveCount(0);
    }
    const before = await prisma.assignment.count();
    for (const path of [
      '/api/assignments/create',
      '/api/domain/reporter',
      '/api/domain/lesson-planner/packet',
      '/app/organization/students',
    ]) {
      const response = await page.request.post(path, {
        form: { intent: 'create' },
        maxRedirects: 0,
      });
      expect(response.status(), path).toBe(403);
    }
    const plannerResponse = await page.request.post(
      '/api/domain/lesson-planner',
      {
        form: { message: 'Outline a lesson on thesis statements' },
        maxRedirects: 0,
      }
    );
    expect(plannerResponse.status()).not.toBe(403);
    expect(await prisma.assignment.count()).toBe(before);
    if (width === 1440) {
      await demoFeedbackFlag(true);
    }
    await prisma.freeTierApplication.update({
      where: { id: app.id },
      data: { status: 'APPROVED' },
    });
    await page.reload();
    await expect(page.getByTestId('teaching-access-banner')).toHaveCount(0);
    await expect(page.getByTestId('teaching-access-approval-toast')).toBeVisible();
    await expectFreeDashboardAssignmentTiles(page);
    await expectDashboardAssignmentTileNameMetaNoOverlap(
      page,
      page.getByTestId('free-assignment-tiles')
    );
    await expectTileNamesWrapOnWordBoundaries(
      page,
      page.getByTestId('free-assignment-tiles')
    );
    await expect(
      page.getByTestId('free-assignment-tiles').locator('img')
    ).toHaveCount(3);
    if (width === 390) {
      await capture(page, 'dashboard-approved-390');
    }
    if (width === 1440) {
      await expectGiveFeedbackAccessible(page);
      await capture(page, 'approval-toast-above-feedback-1440');
    }
    await page
      .getByTestId('teaching-access-approval-toast')
      .getByRole('button', { name: 'Dismiss' })
      .click();
    await expect(page.getByTestId('teaching-access-approval-toast')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('teaching-access-approval-toast')).toHaveCount(0);
    await page
      .getByRole('link', { name: /New Class Starter assignment/i })
      .click();
    await expect(page).toHaveURL(/\/app\/assignment-types\/[^/]+$/);
    await expect(page).not.toHaveURL(/\/how-it-works$/);
    const seeHowItWorks = page.getByRole('link', { name: /See how it works/i });
    await expect(seeHowItWorks).toBeVisible();
    await seeHowItWorks.click();
    await expect(page).toHaveURL(/\/how-it-works$/);
    if (width === 1440) {
      await capture(page, 'approved-class-starter-see-how-it-works-1440');
    }
    await page.goto('/app/assignments');
    await expect(page.getByRole('heading', { name: 'My Assignments', exact: true })).toBeVisible();
    await capture(page, `approved-assignments-${width}`);
  });
}

test('explore stays on pending when classroom is not provisioned yet', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await login(page, user.email!);
  await page.goto('/app/free-tier/pending');
  await expect(
    page.getByRole('link', { name: 'Explore my classroom' })
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explore my classroom' }).click();
  await expectLockedAppHome(page);
  await expect(page.getByTestId('teaching-access-banner')).toBeVisible();
  const updated = await prisma.freeTierApplication.findUniqueOrThrow({
    where: { id: app.id },
    select: { organizationId: true },
  });
  expect(updated.organizationId).toBeTruthy();
});

test('explore shows with a stale default-org membership cookie', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const defaultMembership = await prisma.orgMembership.create({
    data: {
      userId: user.id!,
      organizationId: 'default-org',
      role: 'TEACHER',
    },
    select: { id: true },
  });
  await login(page, user.email!);
  await page.request.post('/api/membership-id', {
    form: { membershipId: defaultMembership.id },
  });
  await page.goto('/app/free-tier/pending');
  await expect(
    page.getByRole('link', { name: 'Explore my classroom' })
  ).toBeVisible();
  await page.getByRole('link', { name: 'Explore my classroom' }).click();
  await expectLockedAppHome(page);
  await expect(page.getByTestId('teaching-access-banner')).toBeVisible();
});

test('stale tab blocked POST shows approval required toast without changing page state', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  await login(page, user.email!);
  await page.goto('/app/free-tier/pending');
  await page.getByRole('link', { name: 'Explore my classroom' }).click();
  await prisma.freeTierApplication.update({
    where: { id: app.id },
    data: { status: 'APPROVED' },
  });
  await expect
    .poll(async () => {
      const row = await prisma.freeTierApplication.findUnique({
        where: { id: app.id },
        select: { status: true },
      });
      return row?.status;
    })
    .toBe('APPROVED');
  await page.goto('/app');
  await expect(page.getByTestId('teaching-access-banner')).toHaveCount(0);
  await expect(page.getByTestId('teaching-access-approval-toast')).toBeVisible({
    timeout: 30_000,
  });
  await prisma.freeTierApplication.update({
    where: { id: app.id },
    data: { status: 'SENT' },
  });
  await expect
    .poll(async () => {
      const row = await prisma.freeTierApplication.findUnique({
        where: { id: app.id },
        select: { status: true },
      });
      return row?.status;
    })
    .toBe('SENT');
  const blocked = await page.evaluate(async () => {
    const body = new FormData();
    body.set('intent', 'create');
    const response = await fetch('/api/assignments/create', {
      method: 'POST',
      body,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, payload };
  });
  expect(blocked.status).toBe(403);
  expect(blocked.payload?.error).toBe('approval_required');
});

test('legacy public enrollment cannot bypass pending approval', async ({ page }) => {
  const { app, user } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const org = await prisma.freeTierApplication.findUniqueOrThrow({
    where: { id: app.id },
    select: { organizationId: true },
  });
  const school = await prisma.school.create({
    data: {
      name: 'Local invitation',
      code: crypto.randomUUID(),
      organizationId: org.organizationId!,
    },
  });
  const klass = await prisma.class.create({
    data: { schoolId: school.id, code: crypto.randomUUID() },
  });
  const email = `legacy-${crypto.randomUUID()}@example.test`;
  const storage = createCookieSessionStorage({
    cookie: {
      name: 'en_invitation',
      secrets: process.env.SESSION_SECRET!.split(','),
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    },
  });
  const invitation = await storage.getSession();
  invitation.set('email', email);
  invitation.set('klassId', klass.id);
  await page.context().addCookies([
    {
      name: 'en_invitation',
      value: (await storage.commitSession(invitation)).split(';')[0]!.slice(
        'en_invitation='.length
      ),
      url: `http://localhost:${process.env.CLASS_STEP_PORT}`,
    },
  ]);
  const response = await page.request.post('/auth/inv/onboard-student', {
    form: {
      name: 'Legacy Student',
      classId: klass.id,
      password: 'password1234',
      confirmPassword: 'password1234',
    },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
});

async function exploreLockedApp(page: import('@playwright/test').Page, userEmail: string) {
  await login(page, userEmail);
  await page.goto('/app/free-tier/pending');
  await page.getByRole('link', { name: 'Explore my classroom' }).click();
  await expectLockedAppHome(page);
  await expect(page.getByTestId('teaching-access-banner')).toBeVisible();
}

async function expectRouteOmitsTeachingSecrets(
  page: import('@playwright/test').Page,
  path: string,
  routeId: string,
  classId: string,
  secrets: { code: string; joinToken: string | null }
) {
  const ssr = await page.request.get(path);
  expect(ssr.status()).toBe(200);
  const ssrText = await ssr.text();
  expect(ssrText).not.toContain(secrets.code);
  if (secrets.joinToken) {
    expect(ssrText).not.toContain(secrets.joinToken);
  }
  expect(ssrText).toContain(classId);

  const data = await page.request.get(`${path}.data?_routes=${routeId}`);
  expect(data.status()).toBe(200);
  const dataText = await data.text();
  expect(dataText).not.toContain(secrets.code);
  if (secrets.joinToken) {
    expect(dataText).not.toContain(secrets.joinToken);
  }
  expect(dataText).toContain(classId);
}

test('pending teacher /app HTML and loader data omit the real class code', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const klass = await prisma.class.findFirstOrThrow({
    where: {
      teachers: { some: { user: { id: user.id } } },
    },
    select: { id: true, code: true },
  });
  await exploreLockedApp(page, user.email!);
  const appSsr = await page.request.get('/app');
  expect(appSsr.status()).toBe(200);
  expect(await appSsr.text()).not.toContain(klass.code);
  const appData = await page.request.get(
    '/app.data?_routes=routes/app._index'
  );
  expect(appData.status()).toBe(200);
  expect(await appData.text()).not.toContain(klass.code);
  let html = await page.content();
  expect(html).not.toContain(klass.code);
  await page.goto('/app/my-classes');
  html = await page.content();
  expect(html).not.toContain(klass.code);
  await page.goto(`/app/my-classes/${klass.id}?tab=students`);
  html = await page.content();
  expect(html).not.toContain(klass.code);
});

test('pending org owner organization pages omit class code and join token', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const joinToken = `e2e-locked-preview-join-${crypto.randomUUID()}`;
  const klass = await prisma.class.findFirstOrThrow({
    where: {
      teachers: { some: { user: { id: user.id } } },
    },
    select: { id: true, code: true, schoolId: true, studentJoinToken: true },
  });
  await prisma.class.update({
    where: { id: klass.id },
    data: { studentJoinToken: joinToken },
  });
  const secrets = { code: klass.code, joinToken };
  await exploreLockedApp(page, user.email!);
  await expectRouteOmitsTeachingSecrets(
    page,
    '/app/organization/classes',
    'routes/app.organization.classes',
    klass.id,
    secrets
  );
  await expectRouteOmitsTeachingSecrets(
    page,
    '/app/organization/students',
    'routes/app.organization.students',
    klass.id,
    secrets
  );
  await expectRouteOmitsTeachingSecrets(
    page,
    `/app/organizations/schools/${klass.schoolId}`,
    'routes/app.organizations.schools.$schoolId',
    klass.id,
    secrets
  );
});

test('approved teacher sees the real class code on the dashboard card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  await prisma.freeTierApplication.update({
    where: { id: app.id },
    data: { status: 'APPROVED' },
  });
  const klass = await prisma.class.findFirstOrThrow({
    where: {
      teachers: { some: { user: { id: user.id } } },
    },
    select: { id: true, code: true },
  });
  await login(page, user.email!);
  await page.goto('/app');
  await expect(page.getByTestId('class-code')).toContainText(klass.code);
});

test('locked class surfaces hide the real class code and lock invite controls', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const klass = await prisma.class.findFirstOrThrow({
    where: {
      teachers: { some: { user: { id: user.id } } },
    },
    select: { id: true, code: true },
  });
  await exploreLockedApp(page, user.email!);
  await page.goto('/app/my-classes');
  await expect(page.getByTestId('my-classes-class-options')).toBeVisible();
  await page.goto(`/app/my-classes/${klass.id}?tab=students`);
  const joinCard = page.getByTestId('free-class-join-card-locked');
  await expect(joinCard).toBeVisible();
  const html = await page.content();
  expect(html).not.toContain(klass.code);
  await expect(joinCard.getByTestId('class-code-masked')).toBeVisible();
  await expect(joinCard.getByTestId('class-qr-locked-placeholder')).toBeVisible();
  await joinCard.getByTestId('copy-join-link-button').hover();
  await page.waitForTimeout(350);
  await expect(
    page.getByRole('tooltip', {
      name: /Unlocks once your administrator approves/,
    })
  ).toBeVisible();
});

test('locked assignments tab shows sample rows and locked documents pill', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  const klass = await prisma.class.findFirstOrThrow({
    where: { teachers: { some: { user: { id: user.id } } } },
    select: { id: true },
  });
  await exploreLockedApp(page, user.email!);
  await page.goto(`/app/my-classes/${klass.id}?tab=assignments`);
  await expect(page.getByText('Sample · Not sent').first()).toBeVisible();
  const documentsPill = page.getByTestId(/assignment-documents-/).first();
  await expect(documentsPill).toBeVisible();
  await documentsPill.click({ force: true });
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('heading', { name: 'Unlocks after approval' })
  ).toBeVisible();
  await expect(
    page.getByText(/Sending assignments to your class unlocks once Dr\. Patel/)
  ).toBeVisible();
});

test('full-page assignment form shows inline approval alert and keeps field values', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const { user, app } = await fixture('11', 'SENT');
  await provisionPendingClassroom(app.id, user.id!);
  await exploreLockedApp(page, user.email!);
  await page.goto('/app/assignments/new');
  await page.locator('#assignmentTypeId').selectOption({ index: 1 });
  await page.getByLabel('Title').fill('Community Gardens — Prewriting');
  await page.getByLabel('Prompt').fill('Pick one community garden in your town.');
  await page
    .getByRole('button', { name: 'Create assignment' })
    .click({ force: true });
  await expect(page.getByTestId('teaching-approval-required-alert')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('Community Gardens — Prewriting');
  await expect(page.getByLabel('Prompt')).toHaveValue(
    'Pick one community garden in your town.'
  );
});

test('flag OFF keeps the waiting page and does not expose the in-app lock', async ({
  page,
}) => {
  const { user } = await fixture('11', 'SENT');
  await prisma.orgMembership.create({
    data: {
      userId: user.id,
      organizationId: 'default-org',
      role: 'TEACHER',
    },
  });
  await flag(false);
  await login(page, user.email!);
  await page.goto('/app/free-tier/pending');
  await expect(page).toHaveURL(/free-tier\/pending/);
  await expect(page.getByTestId('teaching-access-banner')).toHaveCount(0);
  await expect(page.getByTestId('free-assignment-tiles')).toHaveCount(0);
});
