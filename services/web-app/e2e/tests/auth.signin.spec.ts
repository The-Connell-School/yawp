import type { Locator } from '@playwright/test';
import { test, expect } from '../test-setup';

function rgbToLuminance(rgb: string) {
  const channels = rgb
    .match(/\d+(\.\d+)?/g)
    ?.slice(0, 3)
    .map((value) => Number(value) / 255);

  if (!channels || channels.length !== 3) {
    throw new Error(`Unable to parse RGB color: ${rgb}`);
  }

  const [red, green, blue] = channels.map((channel) =>
    channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  );

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = rgbToLuminance(foreground);
  const backgroundLuminance = rgbToLuminance(background);

  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

async function expectStackedAbove(top: Locator, bottom: Locator) {
  const topBox = await top.boundingBox();
  const bottomBox = await bottom.boundingBox();

  expect(topBox).not.toBeNull();
  expect(bottomBox).not.toBeNull();
  expect(topBox!.y + topBox!.height).toBeLessThanOrEqual(bottomBox!.y + 1);
}

const TEST_USER = {
  email: 'jdoe@brock.software',
  password: 'johndoe',
};

test.describe('Authentication - real sign in', () => {
  test('shows the conservative C+ login brand refresh', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/auth/login');

    const shell = page.getByTestId('login-page');
    const panel = page.getByTestId('login-panel');
    const heading = page.getByRole('heading', { name: 'Welcome back' });
    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    const submit = page.getByRole('button', { name: /^log in$/i });
    const createAccount = page.getByRole('link', { name: /create account/i });

    await expect(shell).toBeVisible();
    await expect(panel).toBeVisible();
    await expect(heading).toBeVisible();
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(
      page.getByRole('link', { name: /forgot password/i })
    ).toBeVisible();
    await expect(submit).toBeVisible();
    await expect(createAccount).toBeVisible();

    await expect(shell).toHaveCSS('background-color', 'rgb(248, 241, 230)');
    await expect(panel).toHaveCSS('background-color', 'rgb(255, 253, 248)');
    await expect(submit).toHaveCSS('border-radius', '8px');
    await expect(email).toHaveCSS('border-radius', '8px');

    const headingFont = await heading.evaluate(
      (element) => window.getComputedStyle(element).fontFamily
    );
    expect(headingFont.toLowerCase()).toContain('cormorant');

    const submitBackground = await submit.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor
    );
    const submitColor = await submit.evaluate(
      (element) => window.getComputedStyle(element).color
    );
    const secondaryBackground = await createAccount.evaluate(
      (element) => window.getComputedStyle(element).backgroundColor
    );
    expect(contrastRatio(submitColor, submitBackground)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(secondaryBackground).not.toBe(submitBackground);
  });

  test('keeps the refreshed login layout usable on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/auth/login');

    const panel = page.getByTestId('login-panel');
    const email = page.getByLabel('Email');
    const password = page.getByLabel('Password');
    const forgotPassword = page.getByRole('link', {
      name: /forgot password/i,
    });
    const submit = page.getByRole('button', { name: /^log in$/i });
    const createAccount = page.getByRole('link', { name: /create account/i });

    await expect(panel).toBeVisible();
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(forgotPassword).toBeVisible();
    await expect(submit).toBeVisible();
    await expect(createAccount).toBeVisible();

    const panelBox = await panel.boundingBox();
    const viewport = page.viewportSize();

    expect(panelBox).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(panelBox!.x).toBeGreaterThanOrEqual(0);
    expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(viewport!.width);

    await expectStackedAbove(email, password);
    await expectStackedAbove(password, forgotPassword);
    await expectStackedAbove(forgotPassword, submit);
    await expectStackedAbove(submit, createAccount);
  });

  test('signs in via login form and reaches /app', async ({ page, signIn }) => {
    await signIn(TEST_USER.email, TEST_USER.password);
    await expect(page.getByTestId('app._index')).toBeVisible();
  });
});
