import { expect, type Page } from '@playwright/test';

/**
 * Brian's review (Nov 11): no all-caps eyebrows anywhere in the Lounge.
 * Lists the visible text the page sets in capitals with CSS, so a failure
 * names what still shouts.
 */
export async function expectNoAllCapsText(page: Page) {
  await expect(page.locator('[data-lounge-page]').first()).toBeVisible();
  const shouting = await page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>('[data-lounge-page] *'))
      .filter((element) => {
        if (!element.offsetParent && getComputedStyle(element).position !== 'fixed') return false;
        const own = Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
        );
        return own && getComputedStyle(element).textTransform === 'uppercase';
      })
      .map((element) => element.textContent?.trim() ?? '')
  );
  expect(shouting).toEqual([]);
}
