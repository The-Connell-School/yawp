import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import {
  isDevPanelActive,
  openGiveFeedback,
} from '../helpers/dev-panel-feedback';

const prisma = createE2EPrismaClient();
const evidence = process.env.DEMO_FEEDBACK_EVIDENCE_DIR;
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('local demo note persistence, accessibility, error recovery and disabled gate', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.request.post('/auth/dev-login', {
    form: { email: 'dev.teacher@yawp.local', redirectTo: '/app/assignments' },
  });
  const flag = 'feature_flag.demo-feedback-widget';
  const screenshot = async (name: string) => {
    if (evidence) {
      await page.waitForTimeout(250);
      await page.screenshot({
        path: path.join(evidence, `local-${name}.png`),
        fullPage: true,
        mask: [page.locator('header'), page.locator('nav')],
      });
    }
  };
  const oldFlag = await prisma.setting.findUnique({ where: { name: flag } });
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: 'dev.teacher@yawp.local' },
  });
  try {
    await prisma.user.update({
      where: { id: teacher.id },
      data: { isTester: true },
    });
    await prisma.setting.upsert({
      where: { name: flag },
      create: { name: flag, value: 'false', valueType: 'boolean' },
      update: { value: 'false' },
    });
    await page.goto('/app/assignments');
    await page.evaluate(() => localStorage.removeItem('yawp-dev-panel'));
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    if (!(await isDevPanelActive(page))) {
      await expect(
        page.getByRole('button', { name: 'Give feedback', exact: true })
      ).toHaveCount(0);
    }
    const logFeedback = page.getByRole('button', {
      name: 'Log feedback',
      exact: true,
    });
    await expect(logFeedback).toBeVisible();
    await screenshot('before-disabled');
    await logFeedback.click();
    const legacy = page.getByRole('dialog', { name: 'Log feedback' });
    await legacy
      .getByLabel('What I did')
      .fill('Local legacy demo compatibility');
    await legacy
      .getByLabel('What happened')
      .fill('Legacy note remains readable');
    await legacy
      .getByLabel('What I wish it did')
      .fill('Legacy wish remains readable');
    await legacy.getByLabel('Severity').selectOption('low');
    await legacy.getByRole('button', { name: 'Save feedback' }).click();
    await expect(legacy.getByRole('status')).toHaveText(
      'Feedback saved. Thank you.'
    );
    const legacyEntry = await prisma.testerFeedback.findFirstOrThrow({
      where: {
        userId: teacher.id,
        whatIDid: 'Local legacy demo compatibility',
      },
    });
    expect(legacyEntry.actions).toBeNull();
    expect(legacyEntry.severity).toBe('low');
    expect(legacyEntry.whatHappened).toBe('Legacy note remains readable');
    expect(legacyEntry.whatIWish).toBe('Legacy wish remains readable');
    await page.keyboard.press('Escape');

    expect(
      (
        await page.request.post('/api/demo-feedback', {
          data: { note: 'blocked', url: '/app/assignments', actions: [] },
          headers: { origin: new URL(page.url()).origin },
        })
      ).status()
    ).toBe(404);
    await prisma.setting.update({
      where: { name: flag },
      data: { value: 'true' },
    });
    await page.goto('/app/assignments?token=qa-secret&search=private');
    await expect(
      page.getByRole('button', { name: 'Log feedback', exact: true })
    ).toHaveCount(0);
    await screenshot('button');
    const { panel, noteLabel, hasSeverity } = await openGiveFeedback(page);
    await expect(panel.getByLabel(noteLabel)).toBeFocused({ timeout: 15_000 });
    await expect(panel.getByLabel('Page')).toHaveValue(/\/app\/assignments/);
    await screenshot('panel');
    await panel.getByLabel(noteLabel).fill('Local demo feedback E2E note');
    if (hasSeverity) await panel.getByLabel('Severity').selectOption('high');
    await screenshot('populated');
    const submission = page.waitForRequest(
      (request) =>
        (request.url().endsWith('/api/dev-panel/feedback') ||
          request.url().endsWith('/api/demo-feedback')) &&
        request.method() === 'POST'
    );
    const sendButton = panel.getByRole('button', { name: 'Send feedback' });
    await sendButton.scrollIntoViewIfNeeded();
    await sendButton.click();
    const submitted = (await submission).postDataJSON();
    await expect(panel.getByRole('status')).toContainText(
      'Thanks. The Yawp! team has your note, screenshot and page URL.'
    );
    const entry = await prisma.testerFeedback.findFirstOrThrow({
      where: {
        userId: teacher.id,
        whatHappened: 'Local demo feedback E2E note',
      },
    });
    expect(entry.url).toBe('/app/assignments');
    expect(['demo', 'development']).toContain(entry.environment);
    if (hasSeverity) expect(entry.severity).toBe('high');
    expect(entry.whatIWish).toBe('');
    expect(Array.isArray(entry.actions)).toBe(true);
    expect(entry.actions).toEqual(submitted.actions);
    expect((entry.actions as unknown[]).length).toBeLessThanOrEqual(5);
    expect(entry.actions).toContainEqual({
      type: 'route',
      path: '/app/assignments',
    });
    expect(entry.whatIDid).toContain('Opened /app/assignments');
    expect(entry.whatIDid).not.toMatch(/qa-secret|private|Local demo feedback/);
    await screenshot('success');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    const retry = await openGiveFeedback(page);
    const retryPanel = retry.panel;
    if (retry.hasSeverity) {
      await expect(retryPanel.getByLabel('Severity')).toHaveValue('');
      await retryPanel.getByLabel('Severity').selectOption('medium');
    }
    await retryPanel.getByLabel(retry.noteLabel).fill('Retry keeps my note');
    await page.route('**/api/dev-panel/feedback', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Could not save feedback. Please try again.' },
      })
    );
    await page.route('**/api/demo-feedback', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Could not save feedback. Please try again.' },
      })
    );
    const retrySend = retryPanel.getByRole('button', { name: 'Send feedback' });
    await retrySend.scrollIntoViewIfNeeded();
    await retrySend.click();
    await expect(retryPanel.getByRole('alert')).toContainText(
      "Couldn't send your feedback"
    );
    await expect(retryPanel.getByRole('alert')).toContainText(
      'Your note is still here. Check your connection and try again.'
    );
    await expect(retryPanel.getByLabel(retry.noteLabel)).toHaveValue(
      'Retry keeps my note'
    );
    if (retry.hasSeverity) {
      await expect(retryPanel.getByLabel('Severity')).toHaveValue('medium');
    }
    await screenshot('error-mobile');
    await page.unroute('**/api/dev-panel/feedback');
    await page.unroute('**/api/demo-feedback');
    const retryAgain = retryPanel.getByRole('button', { name: 'Try again' });
    await retryAgain.scrollIntoViewIfNeeded();
    await retryAgain.click();
    await expect(retryPanel.getByRole('status')).toContainText(
      'Thanks. The Yawp! team has your note, screenshot and page URL.'
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
  } finally {
    await prisma.user.update({
      where: { id: teacher.id },
      data: { isTester: teacher.isTester },
    });
    await prisma.testerFeedback.deleteMany({
      where: {
        userId: teacher.id,
        whatIDid: 'Local legacy demo compatibility',
      },
    });
    await prisma.testerFeedback.deleteMany({
      where: {
        userId: teacher.id,
        whatHappened: {
          in: ['Local demo feedback E2E note', 'Retry keeps my note'],
        },
      },
    });
    if (oldFlag)
      await prisma.setting.update({
        where: { name: flag },
        data: { value: oldFlag.value },
      });
    else await prisma.setting.deleteMany({ where: { name: flag } });
  }
});

test('local demo single trigger reserves mobile content space on landing, classes and assignment', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.removeItem('yawp-dev-panel'));
  const flag = 'feature_flag.demo-feedback-widget';
  const oldFlag = await prisma.setting.findUnique({ where: { name: flag } });
  const teacher = await prisma.user.findUniqueOrThrow({
    where: { email: 'dev.teacher@yawp.local' },
  });
  const classAssignment = await prisma.classAssignment.findFirstOrThrow({
    where: { class: { teachers: { some: { userId: teacher.id } } } },
  });
  // The current classes page is /app/my-classes; /app/classes is not a registered route.
  const routes = [
    '/app',
    '/app/my-classes',
    `/app/assignments/${classAssignment.assignmentId}`,
  ];
  const failures: string[] = [];
  const boxes: unknown[] = [];
  try {
    await prisma.user.update({
      where: { id: teacher.id },
      data: { isTester: true },
    });
    await prisma.setting.upsert({
      where: { name: flag },
      create: { name: flag, value: 'true', valueType: 'boolean' },
      update: { value: 'true' },
    });
    await page.request.post('/auth/dev-login', {
      form: { email: teacher.email!, redirectTo: '/app' },
    });
    for (const viewport of [
      { width: 360, height: 740 },
      { width: 390, height: 844 },
      { width: 1280, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      for (const [index, route] of routes.entries()) {
        await page.goto(route);
        await page.waitForLoadState('domcontentloaded');
        const beaker = page.getByRole('button', { name: 'Open developer tools' });
        const legacyGiveFeedback = page.getByRole('button', {
          name: 'Give feedback',
          exact: true,
        });
        await expect(beaker.or(legacyGiveFeedback).first()).toBeVisible({
          timeout: 60_000,
        });
        const devPanel = (await beaker.count()) > 0;
        const trigger = devPanel ? beaker : legacyGiveFeedback;
        await page.waitForTimeout(300);
        const geometry = await trigger.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const main = document.querySelector('main');
          return {
            trigger: rect.toJSON(),
            main: main?.getBoundingClientRect().toJSON(),
            flask: document
              .querySelector('.local-dev-environment-control')
              ?.getBoundingClientRect()
              .toJSON(),
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
          };
        });
        boxes.push({ viewport, route, devPanel, ...geometry });
        expect(geometry.flask).toBeTruthy();
        if (!devPanel) {
          if (viewport.width < 640) {
            if (!geometry.main || geometry.main.bottom > geometry.trigger.top)
              failures.push(
                `${viewport.width} ${route}: content extends into feedback row`
              );
          } else {
            expect(geometry.trigger.bottom).toBe(viewport.height - 80);
            expect(geometry.trigger.right).toBe(viewport.width - 16);
          }
        } else {
          expect(geometry.trigger.bottom).toBeLessThanOrEqual(viewport.height);
          expect(geometry.trigger.right).toBeLessThanOrEqual(viewport.width);
        }
        expect(geometry.scrollWidth).toBeLessThanOrEqual(viewport.width);
        if (evidence)
          await page.screenshot({
            path: path.join(
              evidence,
              `local-${viewport.width}-${index}-closed.png`
            ),
          });
        await expect(
          page.getByRole('button', { name: 'Log feedback', exact: true })
        ).toHaveCount(0);
        const { panel, noteLabel, hasSeverity } = await openGiveFeedback(page);
        await expect(panel).toBeVisible();
        if (hasSeverity) await panel.getByLabel('Severity').selectOption('medium');
        else await panel.getByLabel(noteLabel).fill('Layout check note');
        await page.waitForTimeout(300);
        if (evidence)
          await page.screenshot({
            path: path.join(
              evidence,
              `local-${viewport.width}-${index}-panel.png`
            ),
          });
        await page.keyboard.press('Escape');
      }
    }
    if (evidence)
      await writeFile(
        path.join(evidence, 'bounding-boxes.json'),
        JSON.stringify(boxes, null, 2)
      );
    expect(failures).toEqual([]);
  } finally {
    await prisma.user.update({
      where: { id: teacher.id },
      data: { isTester: teacher.isTester },
    });
    if (oldFlag)
      await prisma.setting.update({
        where: { name: flag },
        data: { value: oldFlag.value },
      });
    else await prisma.setting.deleteMany({ where: { name: flag } });
  }
});
