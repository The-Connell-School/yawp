import { beforeEach, describe, expect, test } from 'bun:test';
import {
  commitUaPartnerContext,
  destroyUaPartnerContext,
  getUaPartnerContext,
  getUaPartnerCodeCapture,
  isUaStudentBillingEnabled,
  isValidUaPartnerCode,
} from './ua-partner.server';

describe('UA partner context', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
    delete process.env.UA_STUDENT_BILLING_ENABLED;
    delete process.env.UA_ORGANIZATION_ID;
    delete process.env.UA_PARTNER_CODE;
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
          'https://yawp.school/ua/sign-up?code=roll-tide-2026&from=email'
        )
      )
    ).toEqual({ accepted: true, redirectTo: '/ua/sign-up?from=email' });
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
