import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';
import { createE2EPrismaClient } from '../prisma-client';
const db = createE2EPrismaClient();
const prefix = `resend-browser-${Date.now()}`;
const capture = process.env.SIGNON_RESEND_CAPTURE_DIR!;
const evidence = process.env.SIGNON_EVIDENCE_DIR;
const flags = ['feature_flag.unified-sign-on', 'feature_flag.free_tier'];
let oldFlags: any[];
test.beforeAll(async () => {
  if (
    process.env.SIGNON_LOCAL_TEST !== '1' ||
    !['localhost', '127.0.0.1'].includes(
      new URL(process.env.E2E_DATABASE_URL!).hostname
    )
  )
    throw new Error('Disposable local DB only');
  oldFlags = await db.setting.findMany({ where: { name: { in: flags } } });
  for (const name of flags)
    await db.setting.upsert({
      where: { name },
      create: { name, value: 'true', valueType: 'boolean' },
      update: { value: 'true' },
    });
});
test.afterAll(async () => {
  await db.freeTierApplication.deleteMany({
    where: { email: { startsWith: prefix } },
  });
  await db.signonFlow.deleteMany({
    where: { data: { path: ['identifier'], string_contains: prefix } },
  });
  await db.setting.deleteMany({ where: { name: { in: flags } } });
  for (const row of oldFlags) await db.setting.create({ data: row });
  await db.$disconnect();
});
for (const width of [1280, 390])
  for (const status of ['INVITED', 'SENT'] as const)
    test(`proved ${status} preview resend enforces delivery authorization at ${width}`, async ({
      page,
    }) => {
      test.setTimeout(90000);
      const email = `${prefix}-${status.toLowerCase()}-${width}@example.invalid`;
      const resendLabel =
        status === 'INVITED' ? 'Resend invite' : 'Resend email';
      const app = await db.freeTierApplication.create({
        data: {
          email,
          name: 'Private QA Teacher',
          schoolName: 'Local QA',
          location: 'Local',
          gradeLevel: '11',
          status,
        },
      });
      const shot = async (state: string) => {
        if (!evidence) return;
        fs.mkdirSync(evidence, { recursive: true });
        await page.screenshot({
          path: path.join(evidence, `signon-22-${state}-${width}-impl.png`),
          fullPage: true,
          mask: [
            page.locator(
              '.signon-identity, .signon-chips, .signon-copy, input[name="identifier"], input[name="code"]'
            ),
          ],
        });
      };
      await page.setViewportSize({
        width,
        height: width === 1280 ? 1000 : 844,
      });
      await page.goto('/auth/login');
      await page.waitForFunction(() =>
        Boolean((window as any).__reactRouterDataRouter)
      );
      await page.getByLabel('Email or class code').fill(email);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await page.getByRole('button', { name: "I'm a teacher" }).click();
      await page
        .getByRole('button', { name: 'Already applied? Email me my status' })
        .click();
      await expect(
        page.getByRole('heading', { name: 'Check your email', exact: true })
      ).toBeVisible();
      const otpResponse = await page.request.post(
        '/api/preview/qa/signon-code',
        {
          headers: {
            authorization: `Bearer ${process.env.PREVIEW_ACCESS_SECRET}`,
          },
          data: { email },
        }
      );
      expect(otpResponse.status()).toBe(200);
      const code = (await otpResponse.json()).code;
      await page.getByLabel('Code', { exact: true }).fill(code);
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name:
            status === 'INVITED'
              ? 'Check your email for your invite'
              : 'Waiting on your administrator',
        })
      ).toBeVisible();
      await shot(status.toLowerCase());
      const before = fs.readdirSync(capture);
      await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname.startsWith('/auth/login') &&
            response.request().method() === 'POST'
        ),
        page.getByRole('button', { name: resendLabel, exact: true }).click(),
      ]);
      await expect(
        page.getByText('Email delivery is unavailable.', { exact: true }).or(
          page.getByText('If available, an email is on its way.', {
            exact: true,
          })
        )
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: resendLabel, exact: true })
      ).toBeEnabled();
      await shot(
        (status === 'SENT' ? 'sent-' : '') +
          (process.env.SIGNON_RESEND_PHASE === 'before' ? 'failure' : 'notice')
      );
      await expect(
        page.getByText('If available, an email is on its way.', { exact: true })
      ).toBeVisible();
      const added = fs
        .readdirSync(capture)
        .filter((file) => !before.includes(file));
      if (status === 'SENT') {
        // Email proof alone cannot authorize an administrator reminder.
        expect(added.length).toBe(0);
        expect(
          await db.freeTierEmailLog.count({ where: { applicationId: app.id } })
        ).toBe(0);
        return;
      }
      expect(added.length).toBe(1);
      const mail = JSON.parse(
        fs.readFileSync(path.join(capture, added[0]), 'utf8')
      );
      // Boolean checks keep identifiers and signed links out of assertion output.
      expect(mail.to === email).toBe(true);
      expect(mail.subject === "You're in — start your YAWP! classroom").toBe(
        true
      );
      expect(mail.text.includes('/free/join?t=')).toBe(true);
      expect(mail.html.includes('/free/join?t=')).toBe(true);
      const joinLine = mail.text
        .split('\n')
        .find((line: string) => line.includes('/free/join?t='));
      const token = new URL(joinLine).searchParams.get('t')!;
      const [body, signature, opaque] = token.split('.');
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      expect(
        payload.applicationId === app.id && payload.purpose === 'RELEASE'
      ).toBe(true);
      expect(
        createHmac('sha256', process.env.FREE_TIER_LINK_HMAC_SECRET!)
          .update(body)
          .digest('base64url') === signature
      ).toBe(true);
      expect(
        Boolean(
          await db.freeTierSignedLink.findFirst({
            where: {
              id: payload.linkId,
              applicationId: app.id,
              purpose: 'RELEASE',
              tokenHash: createHash('sha256').update(opaque).digest('hex'),
              usedAt: null,
              expiresAt: { gt: new Date() },
            },
          })
        )
      ).toBe(true);

      expect(!mail.bcc?.length).toBe(true);
      expect(
        await db.freeTierEmailLog.count({
          where: { applicationId: app.id, kind: 'release', success: true },
        })
      ).toBe(1);
      expect(
        (await page.context().cookies()).some(
          (cookie) => cookie.name === 'en_session'
        )
      ).toBe(false);
      // The first success does not grant a session.
      expect(
        await db.freeTierApplication.count({
          where: { id: app.id, status: 'INVITED', userId: null },
        })
      ).toBe(1);
    });
for (const width of [1280, 390])
  test(`flag-OFF login signup and free-trial controls at ${width}`, async ({
    page,
  }) => {
    await db.setting.update({
      where: { name: flags[0] },
      data: { value: 'false' },
    });
    await page.setViewportSize({ width, height: width === 1280 ? 1000 : 844 });
    for (const [route, name] of [
      ['/auth/login', 'login'],
      ['/auth/inv/signup', 'signup'],
      ['/free', 'free-trial'],
    ]) {
      await page.goto(route);
      if (name === 'login')
        await expect(
          page.getByRole('heading', { name: 'Welcome back!' })
        ).toBeVisible();
      if (name === 'free-trial')
        await expect(
          page.getByRole('button', { name: /waitlist|submit|continue|trial/i })
        ).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (evidence)
        await page.screenshot({
          path: path.join(evidence, `flag-off-${name}-${width}-impl.png`),
          fullPage: true,
          mask: [page.locator('input')],
        });
    }
    await db.setting.update({
      where: { name: flags[0] },
      data: { value: 'true' },
    });
  });
