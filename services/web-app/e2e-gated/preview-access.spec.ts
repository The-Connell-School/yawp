import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createE2EPrismaClient } from '../e2e/prisma-client';
import { mintFreeTierLinkForE2E } from '../e2e/helpers/mint-free-tier-link';
import { expect, test } from '@playwright/test';

const ACCESS_CODE = 'brave-otter-4193';
const MASTER_ACCESS_CODE = 'yawp-rocks';
const ORIGINAL_PATH = '/accessibility?gate-e2e=1';

async function enterPreview(page: import('@playwright/test').Page) {
  await page.goto(ORIGINAL_PATH);
  await page.getByLabel('Access code').fill(ACCESS_CODE);
  await page.getByRole('button', { name: 'Open preview' }).click();
  await expect(page).toHaveURL(ORIGINAL_PATH);
}

test.describe('in-app preview access gate', () => {
  test('a real event token and independently opened signed links enter only the free-tier flow', async ({ request, playwright, baseURL }) => {
    const local = parseEnv(readFileSync(new URL('../e2e/.env.e2e', import.meta.url), 'utf8'));
    process.env.E2E_DATABASE_URL = local.E2E_DATABASE_URL;
    process.env.FREE_TIER_LINK_HMAC_SECRET = local.FREE_TIER_LINK_HMAC_SECRET;
    const prisma = createE2EPrismaClient();
    const opaque = randomBytes(24).toString('base64url');
    const code = randomBytes(8).toString('base64url');
    const token = await prisma.acquisitionToken.create({ data: {
      tokenHash: createHash('sha256').update(opaque).digest('hex'),
      code, label: 'Preview gate regression', maxUses: 1,
    } });
    const application = await prisma.freeTierApplication.create({ data: {
      name: 'Preview Gate Teacher', email: `preview-gate-${code}@yawp.local`,
      schoolName: 'Demo', location: 'Demo', gradeLevel: '10', status: 'INVITED',
      acquisitionTokenId: token.id,
    } });
    const previousFlag = await prisma.setting.findUnique({ where: { name: 'feature_flag.free_tier' } });
    await prisma.setting.upsert({
      where: { name: 'feature_flag.free_tier' },
      create: { name: 'feature_flag.free_tier', value: 'true', valueType: 'boolean' },
      update: { value: 'true' },
    });
    try {
      const landing = await request.get(`/free?t=${code}`, { maxRedirects: 0 });
      expect(landing.status()).toBe(200);
      expect(await landing.text()).toMatch(/Try Yawp!/i);
      const { cookies } = await request.storageState();
      expect(cookies.some(c => c.name === '__yawp_free_tier_access' && c.httpOnly)).toBe(true);
      expect(cookies.some(c => c.name === '__yawp_preview_access')).toBe(false);
      expect((await request.get(`/api/free-tier/token?token=${code}`)).status()).toBe(200);
      expect((await request.post('/api/free-tier/token', { data: {} })).status()).toBe(400);
      expect((await request.post('/free?index', { form: {} })).status()).toBe(200);
      expect((await request.get('/free.data')).status()).toBe(200);
      expect((await request.post('/auth/dev-login', { form: {} })).status()).toBe(401);
      const admin = await request.get('/app/admin', { maxRedirects: 0 });
      expect(admin.status()).toBe(302);
      expect(admin.headers().location).toContain('/auth/preview-access');

      for (const [path, purpose] of [['/free/join', 'RELEASE'], ['/free/admin/approve', 'ADMIN_APPROVE'], ['/free/admin/not-right-person', 'ADMIN_NOT_RIGHT_PERSON']] as const) {
        const signed = await mintFreeTierLinkForE2E(prisma, { applicationId: application.id, purpose });
        const independent = await playwright.request.newContext({ baseURL });
        try {
          const response = await independent.get(`${path}?t=${encodeURIComponent(signed.token)}`, { maxRedirects: 0 });
          expect(response.status()).toBe(200);
          expect((await independent.storageState()).cookies.some(c => c.name === '__yawp_free_tier_access')).toBe(true);
          expect((await prisma.freeTierSignedLink.findUniqueOrThrow({ where: { id: signed.linkId } })).usedAt).toBeNull();
        } finally { await independent.dispose(); }
      }
      await prisma.acquisitionToken.update({ where: { id: token.id }, data: { disabledAt: new Date() } });
      const anonymous = await playwright.request.newContext({ baseURL });
      try {
        const response = await anonymous.get(`/free?t=${code}`, { maxRedirects: 0 });
        expect(response.status()).toBe(302);
        expect(response.headers().location).toContain('/auth/preview-access');
      } finally { await anonymous.dispose(); }
    } finally {
      if (previousFlag) {
        await prisma.setting.update({ where: { name: previousFlag.name }, data: { value: previousFlag.value } });
      } else {
        await prisma.setting.delete({ where: { name: 'feature_flag.free_tier' } });
      }
      await prisma.freeTierApplication.delete({ where: { id: application.id } });
      await prisma.acquisitionToken.delete({ where: { id: token.id } });
      await prisma.$disconnect();
    }
  });

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
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
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
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
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
    await expect(page).toHaveTitle('Preview Access | Yawp!');
    await expect(page.locator('[data-preview-access-screen]')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Find your Yawp!' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
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
        const card = screen.querySelector('.signon-card');
        if (!card) throw new Error('Preview access card was not rendered.');
        const cardStyle = window.getComputedStyle(card);
        return {
          cardBackground: cardStyle.backgroundColor,
          cardBorderRadius: Number.parseFloat(cardStyle.borderRadius),
          cardImages: card.querySelectorAll('img').length,
          cardPadding: Number.parseFloat(cardStyle.padding),
          display: screenStyle.display,
        };
      });
    expect(renderedStyles.display).toBe('flex');
    expect(renderedStyles.cardBackground).toBe('rgb(255, 255, 255)');
    expect(renderedStyles.cardBorderRadius).toBeGreaterThanOrEqual(12);
    expect(renderedStyles.cardPadding).toBeGreaterThanOrEqual(24);
    // The auth layout shows the logo once; the card itself has none.
    expect(renderedStyles.cardImages).toBe(0);

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
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
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
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
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
      page.getByRole('heading', { name: 'Accessibility at Yawp!' })
    ).not.toBeVisible();
  });
});
