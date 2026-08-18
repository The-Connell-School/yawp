import { expect, test } from '@playwright/test';

const ACCESS_CODE = 'brave-otter-4193';
const MASTER_ACCESS_CODE = 'wise-owl-9876';
const ORIGINAL_PATH = '/accessibility?gate-e2e=1';

async function enterPreview(page: import('@playwright/test').Page) {
  await page.goto(ORIGINAL_PATH);
  await page.getByLabel('Access code').fill(ACCESS_CODE);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await expect(page).toHaveURL(ORIGINAL_PATH);
}

test.describe('in-app preview access gate', () => {
  test('requires a master-code user to choose an organization before entering the preview', async ({
    context,
    page,
  }) => {
    const requestedDevLoginPages: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/auth/dev-login/options') {
        requestedDevLoginPages.push(request.url());
      }
    });

    await page.goto(ORIGINAL_PATH);
    await page.getByLabel('Access code').fill(MASTER_ACCESS_CODE);
    await page.getByRole('button', { name: 'Open preview' }).click();

    await expect(
      page.getByRole('heading', { name: 'Choose an organization' })
    ).toBeVisible();
    await expect(page).toHaveURL(
      /\/auth\/preview-access\?returnTo=%2Faccessibility%3Fgate-e2e%3D1$/
    );
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).not.toBeVisible();
    expect(requestedDevLoginPages).toEqual([]);
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === '__yawp_preview_access'
      )
    ).toBe(false);

    await page.getByLabel('Organization').selectOption({
      label: 'Yawp Local Dev',
    });
    await page
      .getByRole('button', { name: 'Continue to organization' })
      .click();

    await expect(page).toHaveURL(ORIGINAL_PATH);
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).toBeVisible();
    await page
      .getByRole('button', {
        name: 'Local development environment. Open dev login menu.',
      })
      .click();
    await expect(page.getByText('Current seat: Yawp Local Dev')).toBeVisible();
    await expect(page.getByText('Alex Teacher')).toBeVisible();
    expect(requestedDevLoginPages).toHaveLength(1);
  });

  test('loads dev-login users only after the Beaker opens', async ({
    page,
  }) => {
    const requestedCursors: number[] = [];
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname === '/auth/dev-login/options') {
        requestedCursors.push(Number(url.searchParams.get('cursor') ?? '0'));
      }
    });

    await enterPreview(page);
    expect(requestedCursors).toEqual([]);

    await page
      .getByRole('button', {
        name: 'Local development environment. Open dev login menu.',
      })
      .click();

    await expect(page.getByText('Alex Teacher')).toBeVisible();
    expect(requestedCursors).toEqual([0]);
  });

  test('blocks anonymous browser and API access until a valid code is entered', async ({
    context,
    page,
  }) => {
    const stylesheetResponses: number[] = [];
    page.on('response', (response) => {
      if (response.request().resourceType() === 'stylesheet') {
        stylesheetResponses.push(response.status());
      }
    });

    const navigationResponse = await page.goto(ORIGINAL_PATH);

    expect(navigationResponse?.status()).toBe(200);
    expect(navigationResponse?.headers()['www-authenticate']).toBeUndefined();
    await expect(page).toHaveURL(
      /\/auth\/preview-access\?returnTo=%2Faccessibility%3Fgate-e2e%3D1$/
    );
    await expect(page).toHaveTitle('Preview Access | YAWP!');
    await expect(page.locator('[data-preview-access-screen]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Find your YAWP!' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).not.toBeVisible();

    await expect
      .poll(() =>
        stylesheetResponses.some((status) => status >= 200 && status < 300)
      )
      .toBe(true);
    const renderedStyles = await page
      .locator('[data-preview-access-screen]')
      .evaluate((screen) => {
        const screenStyle = window.getComputedStyle(screen);
        const card = screen.querySelector('section');
        if (!card) throw new Error('Preview access card was not rendered.');
        const cardStyle = window.getComputedStyle(card);
        return {
          cardBorderRadius: Number.parseFloat(cardStyle.borderRadius),
          cardPadding: Number.parseFloat(cardStyle.padding),
          display: screenStyle.display,
          minHeight: Number.parseFloat(screenStyle.minHeight),
        };
      });
    expect(renderedStyles.display).toBe('flex');
    expect(renderedStyles.minHeight).toBeGreaterThanOrEqual(
      page.viewportSize()?.height ?? 1
    );
    expect(renderedStyles.cardBorderRadius).toBeGreaterThanOrEqual(16);
    expect(renderedStyles.cardPadding).toBeGreaterThanOrEqual(32);

    const apiRejection = await page.evaluate(async () => {
      const response = await fetch('/api/student-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'intent=end',
      });
      return {
        body: await response.json(),
        status: response.status,
      };
    });
    expect(apiRejection).toEqual({
      body: { error: 'Preview access code required.' },
      status: 401,
    });

    await page.getByLabel('Access code').fill('wrong-otter-4193');
    await page.getByRole('button', { name: 'Open preview' }).click();
    await expect(page.getByRole('alert')).toHaveText(
      'That access code was not recognized.'
    );
    await expect(page.locator('[data-preview-access-screen]')).toBeVisible();
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === '__yawp_preview_access'
      )
    ).toBe(false);

    await page.goto(ORIGINAL_PATH);
    await expect(page).toHaveURL(
      /\/auth\/preview-access\?returnTo=%2Faccessibility%3Fgate-e2e%3D1$/
    );
    await expect(page.locator('[data-preview-access-screen]')).toBeVisible();

    await page.getByLabel('Access code').fill(ACCESS_CODE);
    await page.getByRole('button', { name: 'Open preview' }).click();

    await expect(page).toHaveURL(ORIGINAL_PATH);
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).toBeVisible();
    await expect(
      page.locator('[data-preview-access-screen]')
    ).not.toBeVisible();
    await expect
      .poll(async () => {
        const cookies = await context.cookies();
        return cookies.some(
          (cookie) => cookie.name === '__yawp_preview_access' && cookie.httpOnly
        );
      })
      .toBe(true);

    await page.reload();
    await expect(page).toHaveURL(ORIGINAL_PATH);
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).toBeVisible();

    await page
      .getByRole('button', {
        name: 'Local development environment. Open dev login menu.',
      })
      .click();
    await expect(page.getByText('Current seat: Master')).toBeVisible();
    await page.getByRole('button', { name: 'Re-enter access code' }).click();

    await expect(page).toHaveURL('/auth/preview-access');
    await expect(page.locator('[data-preview-access-screen]')).toBeVisible();
    expect(
      (await context.cookies()).some(
        (cookie) => cookie.name === '__yawp_preview_access'
      )
    ).toBe(false);

    await page.goto(ORIGINAL_PATH);
    await expect(page).toHaveURL(
      /\/auth\/preview-access\?returnTo=%2Faccessibility%3Fgate-e2e%3D1$/
    );
    await expect(page.locator('[data-preview-access-screen]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Accessibility at YAWP!' })
    ).not.toBeVisible();
  });
});
