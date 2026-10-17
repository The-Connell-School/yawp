import { test, expect } from '@playwright/test';
import { createE2EPrismaClient } from '../prisma-client';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';

const prisma = createE2EPrismaClient();
const evidence = process.env.DEMO_FEEDBACK_EVIDENCE_DIR;
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('local demo note persistence, accessibility, error recovery and disabled gate', async ({
  page,
}) => {
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
    await expect(
      page.getByRole('button', { name: 'Give feedback', exact: true })
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Log feedback', exact: true })
    ).toBeVisible();
    await screenshot('before-disabled');
    await page
      .getByRole('button', { name: 'Log feedback', exact: true })
      .click();
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
          data: { note: 'blocked', url: '/app', actions: [] },
          headers: { origin: new URL(page.url()).origin },
        })
      ).status()
    ).toBe(404);
    await prisma.setting.update({
      where: { name: flag },
      data: { value: 'true' },
    });
    await page.goto('/app/assignments?token=qa-secret&search=private');
    const trigger = page.getByRole('button', {
      name: 'Give feedback',
      exact: true,
    });
    await expect(trigger).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Log feedback', exact: true })
    ).toHaveCount(0);
    await screenshot('button');
    await trigger.click();
    const panel = page.getByRole('dialog', { name: 'Give feedback' });
    await expect(panel.getByLabel('Your note')).toBeFocused();
    await expect(
      panel.getByText('/app/assignments', { exact: true })
    ).toBeVisible();
    await screenshot('panel');
    await panel.getByLabel('Your note').fill('Local demo feedback E2E note');
    await panel.getByLabel('Severity').selectOption('high');
    await screenshot('populated');
    const submission = page.waitForRequest(
      (request) =>
        request.url().endsWith('/api/demo-feedback') &&
        request.method() === 'POST'
    );
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    const submitted = (await submission).postDataJSON();
    await expect(panel.getByRole('status')).toHaveText(
      'Feedback saved. Thank you.'
    );
    const entry = await prisma.testerFeedback.findFirstOrThrow({
      where: {
        userId: teacher.id,
        whatHappened: 'Local demo feedback E2E note',
      },
    });
    expect(entry.url).toBe('/app/assignments');
    expect(entry.environment).toBe('demo');
    expect(entry.severity).toBe('high');
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
    await expect(trigger).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await trigger.click();
    await expect(panel.getByLabel('Severity')).toHaveValue('');
    await panel.getByLabel('Severity').selectOption('medium');
    await panel.getByLabel('Your note').fill('Retry keeps my note');
    await page.route('**/api/demo-feedback', (route) =>
      route.fulfill({
        status: 503,
        json: { error: 'Could not save feedback. Please try again.' },
      })
    );
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel.getByRole('alert')).toHaveText(
      'Could not save feedback. Please try again.'
    );
    await expect(panel.getByLabel('Your note')).toHaveValue(
      'Retry keeps my note'
    );
    await expect(panel.getByLabel('Severity')).toHaveValue('medium');
    await screenshot('error-mobile');
    await page.unroute('**/api/demo-feedback');
    await panel.getByRole('button', { name: 'Send feedback' }).click();
    await expect(panel.getByRole('status')).toHaveText(
      'Feedback saved. Thank you.'
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
        const trigger = page.getByRole('button', {
          name: 'Give feedback',
          exact: true,
        });
        await expect(trigger).toBeVisible();
        await page.waitForTimeout(300);
        const geometry = await trigger.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const intersects = (other: DOMRect) =>
            other.width > 0 &&
            other.height > 0 &&
            rect.left < other.right &&
            rect.right > other.left &&
            rect.top < other.bottom &&
            rect.bottom > other.top;
          // Scroll containers clip large cards. Fixed controls can escape those
          // containers, so retain their actual rectangles in the overlap check.
          const visibleRect = (other: Element) => {
            const box = other.getBoundingClientRect();
            let { top, right, bottom, left } = box;
            let fixed = getComputedStyle(other).position === 'fixed';
            for (
              let parent = other.parentElement;
              parent;
              parent = parent.parentElement
            ) {
              if (!fixed) {
                const style = getComputedStyle(parent);
                const clip = parent.getBoundingClientRect();
                if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                  top = Math.max(top, clip.top);
                  bottom = Math.min(bottom, clip.bottom);
                }
                if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                  left = Math.max(left, clip.left);
                  right = Math.min(right, clip.right);
                }
                fixed = style.position === 'fixed';
              }
            }
            return new DOMRect(
              left,
              top,
              Math.max(0, right - left),
              Math.max(0, bottom - top)
            );
          };
          const overlaps = Array.from(
            document.querySelectorAll(
              'button, a, input, textarea, select, [role="button"], [role="link"]'
            )
          )
            .filter(
              (other) =>
                other !== element &&
                !element.contains(other) &&
                !other.contains(element) &&
                other.getClientRects().length
            )
            .filter((other) => {
              const style = getComputedStyle(other);
              return (
                style.visibility !== 'hidden' &&
                style.display !== 'none' &&
                intersects(visibleRect(other))
              );
            })
            .map((other) => ({
              tag: other.tagName,
              label:
                other.getAttribute('aria-label') ||
                other.textContent?.trim().slice(0, 80),
              box: visibleRect(other).toJSON(),
            }));
          const main = document.querySelector('main');
          return {
            trigger: rect.toJSON(),
            main: main?.getBoundingClientRect().toJSON(),
            flask: document
              .querySelector('.local-dev-environment-control')
              ?.getBoundingClientRect()
              .toJSON(),
            overlaps,
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: innerWidth,
          };
        });
        boxes.push({ viewport, route, ...geometry });
        expect(geometry.flask).toBeTruthy();
        if (geometry.flask) {
          const feedback = geometry.trigger;
          const flask = geometry.flask;
          expect(
            feedback.right <= flask.left ||
              feedback.left >= flask.right ||
              feedback.bottom <= flask.top ||
              feedback.top >= flask.bottom
          ).toBe(true);
        }
        if (viewport.width < 640) {
          if (geometry.overlaps.length)
            failures.push(
              `${viewport.width} ${route}: ${JSON.stringify(geometry.overlaps)}`
            );
          if (!geometry.main || geometry.main.bottom > geometry.trigger.top)
            failures.push(
              `${viewport.width} ${route}: content extends into feedback row`
            );
        } else {
          expect(geometry.trigger.bottom).toBe(viewport.height - 80);
          expect(geometry.trigger.right).toBe(viewport.width - 16);
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
        await trigger.click();
        const panel = page.getByRole('dialog', { name: 'Give feedback' });
        await expect(panel).toBeVisible();
        await panel.getByLabel('Severity').selectOption('medium');
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
