import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../test-setup';

// Left menu restyle (Brian's Lesson Planner Redesign, "Left menu" artboard):
// the current page is a white, fully rounded pill with a soft shadow and a bold
// #1D1D1B label; every other link is plain #3A3A36 text. No green in the menu.
const ACTIVE_LABEL = 'rgb(29, 29, 27)';
const INACTIVE_LABEL = 'rgb(58, 58, 54)';
const WHITE = 'rgb(255, 255, 255)';
const PILL_SHADOW = 'rgba(40, 30, 10, 0.12) 0px 1px 4px 0px';

function sidebarLink(page: Page, name: string): Locator {
  return page
    .locator('[data-app-shell] > nav')
    .getByRole('link', { name, exact: true });
}

async function styleOf(link: Locator) {
  return link.evaluate((el) => {
    const row = el.closest('.app-sidebar-row') as HTMLElement | null;
    const s = getComputedStyle(el);
    return {
      color: s.color,
      fontWeight: s.fontWeight,
      background: s.backgroundColor,
      boxShadow: s.boxShadow,
      radius: parseFloat(s.borderTopLeftRadius),
      height: el.getBoundingClientRect().height,
      rowBackground: row ? getComputedStyle(row).backgroundColor : null,
    };
  });
}

test.describe('left menu style', () => {
  test('current page is a white pill; other links are plain grey text', async ({
    page,
    e2eContext,
    signIn,
  }) => {
    await signIn(e2eContext.teacherEmail, 'teacher-e2e-password');
    await page.goto('/app');

    const dashboard = sidebarLink(page, 'Dashboard');
    const myClasses = sidebarLink(page, 'My Classes');
    await expect(dashboard).toHaveAttribute('aria-current', 'page');
    await expect(myClasses).not.toHaveAttribute('aria-current', 'page');

    const active = await styleOf(dashboard);
    expect(active.color).toBe(ACTIVE_LABEL);
    expect(active.fontWeight).toBe('800');
    expect(active.background).toBe(WHITE);
    expect(active.boxShadow).toBe(PILL_SHADOW);
    // Fully rounded: the radius covers at least half the pill's height.
    expect(active.radius).toBeGreaterThanOrEqual(active.height / 2);
    // The row behind the pill no longer carries the old green tint.
    expect(active.rowBackground).toBe('rgba(0, 0, 0, 0)');

    const inactive = await styleOf(myClasses);
    expect(inactive.color).toBe(INACTIVE_LABEL);
    expect(inactive.fontWeight).toBe('400');
    expect(inactive.background).toBe('rgba(0, 0, 0, 0)');
    expect(inactive.boxShadow).toBe('none');

    // The pill follows navigation.
    await myClasses.click();
    await page.waitForURL('**/app/my-classes**');
    await expect(myClasses).toHaveAttribute('aria-current', 'page');
    expect((await styleOf(myClasses)).background).toBe(WHITE);
    expect((await styleOf(dashboard)).color).toBe(INACTIVE_LABEL);
  });
});
