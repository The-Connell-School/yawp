import { test, expect, type Page } from '@playwright/test';
import { createServer as createHttpsServer, type Server } from 'node:https';
import { request as upstreamRequest } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';

// Disposable local DB/server behind TLS. No routing mocks, Origin replacement,
// email delivery or external provider request.
test.skip(process.env.SIGNON_ORIGIN_LOCAL !== '1', 'Local TLS proxy required');
test.describe.configure({ mode: 'serial' });
const db = createE2EPrismaClient();
const flag = 'feature_flag.unified-sign-on';
const prefix = `origin-browser-${Date.now()}`;
const publicUrl = process.env.SIGNON_ORIGIN_URL!;
const beforeFix = process.env.SIGNON_ORIGIN_BEFORE === '1';
let proxy: Server;
async function shot(page: Page, name: string, width: number) {
  if (!process.env.SIGNON_EVIDENCE_DIR) return;
  mkdirSync(process.env.SIGNON_EVIDENCE_DIR, { recursive: true });
  await page.screenshot({
    path: join(process.env.SIGNON_EVIDENCE_DIR, `${name}-${width}-impl.png`),
    fullPage: true,
  });
}
async function setFlag(enabled: boolean) {
  await db.setting.upsert({
    where: { name: flag },
    create: { name: flag, value: String(enabled), valueType: 'boolean' },
    update: { value: String(enabled) },
  });
}
test.beforeAll(async () => {
  if (
    !['127.0.0.1', 'localhost'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    ) ||
    new URL(publicUrl).hostname !== '127.0.0.1'
  )
    throw new Error('Local resources required');
  await db.organization.create({
    data: { id: prefix, name: 'Lincoln High', plan: 'SCHOOL' },
  });
  await db.school.create({
    data: {
      id: prefix,
      code: prefix,
      name: 'Lincoln High',
      organizationId: prefix,
    },
  });
  await db.class.create({
    data: {
      id: prefix,
      code: prefix,
      title: 'English 11, Period 2',
      schoolId: prefix,
    },
  });
  proxy = createHttpsServer(
    {
      key: readFileSync(process.env.SIGNON_TLS_KEY!),
      cert: readFileSync(process.env.SIGNON_TLS_CERT!),
    },
    (incoming, outgoing) => {
      // Model ingress: overwrite forwarding headers and preserve the selected
      // public Host while forwarding over plain HTTP to the real app adapter.
      const target = upstreamRequest(
        `${process.env.SIGNON_UPSTREAM_URL}${incoming.url}`,
        {
          method: incoming.method,
          headers: {
            ...incoming.headers,
            host: new URL(publicUrl).host,
            'x-forwarded-host': new URL(publicUrl).host,
            'x-forwarded-proto': 'https',
            'x-forwarded-port': '443',
          },
        },
        (response) => {
          outgoing.writeHead(response.statusCode!, response.headers);
          response.pipe(outgoing);
        }
      );
      target.on('error', () => {
        outgoing.writeHead(502);
        outgoing.end();
      });
      incoming.pipe(target);
    }
  );
  await new Promise<void>((resolve) =>
    proxy.listen(Number(new URL(publicUrl).port), '127.0.0.1', resolve)
  );
});
test.afterAll(async () => {
  if (proxy) {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
  await db.setting.deleteMany({ where: { name: flag } });
  await db.class.deleteMany({ where: { id: prefix } });
  await db.school.deleteMany({ where: { id: prefix } });
  await db.organization.deleteMany({ where: { id: prefix } });
  await db.$disconnect();
});
for (const width of [1280, 390]) {
  test(`normal HTTPS same-origin submissions through the HTTP adapter at ${width}`, async ({
    page,
    request,
  }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    await setFlag(true);
    for (const [identifier, heading, name] of [
      ['dev.teacher@yawp.local', 'Enter your password', 'signon-05-password'],
      [prefix, 'Join your class', 'signon-20-class'],
    ]) {
      await page.goto(`${publicUrl}/auth/login`);
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await expect(
        page.getByRole('button', { name: 'Continue with Google' })
      ).toBeDisabled();
      await shot(page, beforeFix ? 'before-entry' : 'signon-03-entry', width);
      await page.getByLabel('Email, handle, or class code').fill(identifier);
      const response = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          new URL(r.url()).pathname.startsWith('/auth/login')
      );
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      const submitted = await response;
      expect(submitted.request().headers().origin).toBe(publicUrl);
      expect(submitted.status()).toBe(beforeFix ? 403 : 200);
      if (beforeFix)
        await expect(page.getByRole('alert')).toContainText(
          'Invalid request origin'
        );
      else
        await expect(
          page.getByRole('heading', { name: heading, exact: true })
        ).toBeVisible();
      await shot(page, beforeFix ? `before-${name}` : name, width);
    }
    const google = await request.post(`${publicUrl}/auth/login`, {
      headers: { Origin: publicUrl },
      form: { intent: 'google' },
    });
    expect(google.status()).toBe(beforeFix ? 403 : 503);
    if (!beforeFix)
      expect(await google.json()).toMatchObject({
        error: 'Google sign-in is unavailable. Use your email or handle.',
      });
    const foreign = await request.post(`${publicUrl}/auth/login`, {
      headers: {
        Origin: 'https://evil.example',
        'x-forwarded-host': 'evil.example',
        'x-forwarded-proto': 'https',
      },
      form: { intent: 'resolve', identifier: prefix },
    });
    expect(foreign.status()).toBe(403);
  });
  test(`flag OFF retains login, signup and reset at ${width}`, async ({
    page,
  }) => {
    await setFlag(false);
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/auth/inv/forgot-password', 'reset'],
    ]) {
      await page.goto(`${publicUrl}${route}`);
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await expect(page.locator('[data-signon-screen]')).toHaveCount(0);
      await shot(
        page,
        `${beforeFix ? 'before' : 'after'}-flag-off-${name}`,
        width
      );
    }
  });
}
