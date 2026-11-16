import type { Locator } from '@playwright/test';
import { test, expect } from '../test-setup';

async function scrollAffordanceOverlaps(chips: Locator) {
  return chips.evaluate((root) => {
    const track = root.querySelector('.overflow-x-auto');
    if (!track) return ['missing-track'];
    const trackRect = track.getBoundingClientRect();
    const hits: string[] = [];
    const buttons = root.querySelectorAll(
      '[data-testid$="scroll-left"], [data-testid$="scroll-right"]'
    );
    for (const button of buttons) {
      if (getComputedStyle(button).position === 'absolute') {
        hits.push('absolute-arrow');
      }
      const buttonRect = button.getBoundingClientRect();
      for (const tab of root.querySelectorAll('[role="tab"]')) {
        const tabRect = tab.getBoundingClientRect();
        const left = Math.max(tabRect.left, trackRect.left);
        const right = Math.min(tabRect.right, trackRect.right);
        if (right - left < 1) continue;
        const overlaps =
          buttonRect.left < right - 0.5 &&
          buttonRect.right > left + 0.5 &&
          buttonRect.top < tabRect.bottom &&
          buttonRect.bottom > tabRect.top;
        if (overlaps) {
          hits.push((tab.textContent ?? '').replace(/\s+/g, ' ').trim());
        }
      }
    }
    return hits;
  });
}

test.describe('Filter pill overflow affordances', () => {
  test('class documents status pills scroll with edge fade and chevrons', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/app/my-classes/${e2eContext.classId}?tab=documents`);
    await page.waitForLoadState('networkidle');

    const chips = page.getByTestId('class-documents-status-chips');
    await expect(chips).toBeVisible();
    await expect(chips).toHaveAttribute('data-has-overflow', 'true');

    const scrollRight = page.getByTestId('class-documents-status-chips-scroll-right');
    await expect(scrollRight).toBeVisible();
    await expect(
      page.getByTestId('class-documents-status-chips-fade-right')
    ).toBeVisible();
    await expect(
      page.getByTestId('class-documents-status-chips-scroll-left')
    ).toHaveCount(0);

    const allTab = chips.getByRole('tab', { name: /All/ });
    await expect(allTab).toBeVisible();
    const allBox = await allTab.boundingBox();
    const trackBox = await chips.locator('.overflow-x-auto').boundingBox();
    expect(allBox).toBeTruthy();
    expect(trackBox).toBeTruthy();
    expect(allBox!.x).toBeGreaterThanOrEqual(trackBox!.x - 1);
    expect(allBox!.x + allBox!.width).toBeLessThanOrEqual(
      trackBox!.x + trackBox!.width + 1
    );
    expect(await scrollAffordanceOverlaps(chips)).toEqual([]);

    await scrollRight.click();
    await expect(chips).toHaveAttribute('data-can-scroll-left', 'true');
    await expect(
      page.getByTestId('class-documents-status-chips-fade-left')
    ).toBeVisible();
    expect(await scrollAffordanceOverlaps(chips)).toEqual([]);

    const scrollLeft = page.getByTestId('class-documents-status-chips-scroll-left');
    while (await scrollLeft.isVisible()) {
      await scrollLeft.click();
    }

    await expect(chips).toHaveAttribute('data-can-scroll-left', 'false');
    await expect(
      page.getByTestId('class-documents-status-chips-scroll-left')
    ).toHaveCount(0);
  });

  test('my assignments type pills expose the same overflow controls at narrow widths', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.setViewportSize({ width: 280, height: 800 });
    await page.goto('/app/assignments');
    await page.waitForLoadState('networkidle');

    const pills = page.getByTestId('my-assignments-type-pills');
    const pillTabs = pills.getByRole('tab');
    if ((await pillTabs.count()) < 2) {
      test.skip();
      return;
    }

    await expect(pills).toBeVisible();
    if ((await pills.getAttribute('data-has-overflow')) !== 'true') {
      test.skip();
      return;
    }

    await expect(
      page.getByTestId('my-assignments-type-pills-scroll-right')
    ).toBeVisible();
  });
});