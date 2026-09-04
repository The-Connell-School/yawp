import { beforeEach, describe, expect, test } from 'bun:test';
import {
  commitUaPartnerContext,
  createUaPartnerMiddleware,
  destroyUaPartnerContext,
  getUaPartnerContext,
  getUaPartnerCodeCapture,
  getCanonicalUaUrl,
  isUaStudentBillingEnabled,
  isUaPartnerHost,
  isValidUaPartnerCode,
} from './ua-partner.server';

describe('UA partner context', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
    delete process.env.UA_STUDENT_BILLING_ENABLED;
    delete process.env.UA_ORGANIZATION_ID;
    delete process.env.UA_PARTNER_CODE;
    delete process.env.UA_PARTNER_HOSTNAME;
  });

  test('is disabled unless both the flag and organization are configured', () => {
    expect(isUaStudentBillingEnabled()).toBe(false);
    process.env.UA_STUDENT_BILLING_ENABLED = 'true';
    expect(isUaStudentBillingEnabled()).toBe(false);
    process.env.UA_ORGANIZATION_ID = 'org-ua';
    expect(isUaStudentBillingEnabled()).toBe(false);
    process.env.UA_PARTNER_CODE = 'Roll-Tide-2026';
    expect(isUaStudentBillingEnabled()).toBe(true);
  });

  test('accepts the configured partner code without case or whitespace sensitivity', () => {
    process.env.UA_PARTNER_CODE = 'Roll-Tide-2026';
    expect(isValidUaPartnerCode('  roll-tide-2026 ')).toBe(true);
    expect(isValidUaPartnerCode('another-code')).toBe(false);
  });

  test('captures a partner code from the URL and removes it from the clean redirect', () => {
    process.env.UA_PARTNER_CODE = 'Roll-Tide-2026';
    expect(
      getUaPartnerCodeCapture(
        new Request(
          'https://yawp.school/ua/sign-up?organizationCode=roll-tide-2026&from=email'
        )
      )
    ).toEqual({ accepted: true, redirectTo: '/ua/sign-up?from=email' });
  });

  test('keeps the shorter code parameter as a compatible alias', () => {
    process.env.UA_PARTNER_CODE = 'Roll-Tide-2026';
    expect(
      getUaPartnerCodeCapture(
        new Request('https://yawp.school/ua?code=roll-tide-2026')
      )
    ).toEqual({ accepted: true, redirectTo: '/ua' });
  });

  test('does not mistake an email verification OTP for a partner code', () => {
    process.env.UA_PARTNER_CODE = 'Roll-Tide-2026';
    expect(
      getUaPartnerCodeCapture(
        new Request(
          'https://ua.yawp.school/auth/inv/verify?type=onboard-student&target=student%40ua.edu&code=ABC123&partner=ua'
        )
      )
    ).toBeNull();
  });

  test('round-trips a signed, http-only UA context cookie', async () => {
    const setCookie = await commitUaPartnerContext();
    const context = await getUaPartnerContext(
      new Request('https://yawp.school/auth/login', {
        headers: { cookie: setCookie },
      })
    );

    expect(context).toEqual({ partner: 'ua' });
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=34560000');
    expect(setCookie).not.toContain('Domain=');
  });

  test('recognizes only the configured UA hostname', () => {
    process.env.UA_PARTNER_HOSTNAME = 'ua.yawp.school';

    expect(
      isUaPartnerHost(new Request('https://ua.yawp.school/auth/login'))
    ).toBe(true);
    expect(isUaPartnerHost(new Request('https://yawp.school/auth/login'))).toBe(
      false
    );
    expect(
      isUaPartnerHost(
        new Request('https://ua.yawp.school.attacker.test/auth/login')
      )
    ).toBe(false);
  });

  test('builds an allowlisted canonical UA URL for legacy routes', () => {
    process.env.UA_PARTNER_HOSTNAME = 'ua.yawp.school';

    expect(
      getCanonicalUaUrl(
        new Request(
          'https://yawp.school/ua/sign-up?organizationCode=Roll-Tide-2026'
        ),
        '/auth/inv/signup'
      )
    ).toBe(
      'https://ua.yawp.school/auth/inv/signup?organizationCode=Roll-Tide-2026'
    );
    expect(
      getCanonicalUaUrl(
        new Request('https://ua.yawp.school/auth/login'),
        '/auth/login'
      )
    ).toBeNull();
  });

  test('captures a valid organizationCode on any UA-host route and leaves the regular host untouched', async () => {
    process.env.UA_PARTNER_HOSTNAME = 'ua.yawp.school';
    process.env.UA_PARTNER_CODE = 'Roll-Tide-2026';
    const middleware = createUaPartnerMiddleware();
    const next = async () => new Response('next');

    const captured = await middleware(
      {
        request: new Request(
          'https://ua.yawp.school/auth/login?organizationCode=roll-tide-2026&from=email'
        ),
      } as any,
      next
    );
    expect(captured?.status).toBe(303);
    expect(captured?.headers.get('location')).toBe('/auth/login?from=email');
    expect(captured?.headers.get('set-cookie')).toContain('yawp_partner');

    const regular = await middleware(
      {
        request: new Request(
          'https://yawp.school/auth/login?organizationCode=roll-tide-2026'
        ),
      } as any,
      next
    );
    expect(await regular?.text()).toBe('next');
  });

  test('rejects an unsigned browser-supplied partner value', async () => {
    const context = await getUaPartnerContext(
      new Request('https://yawp.school/auth/login', {
        headers: { cookie: 'yawp_partner=ua' },
      })
    );

    expect(context).toBeNull();
  });

  test('expires the partner cookie when the student explicitly clears it', async () => {
    const header = await destroyUaPartnerContext(
      new Request('https://yawp.school/auth/logout')
    );

    expect(header).toContain('yawp_partner=');
    expect(header).toContain('Max-Age=0');
  });
});
