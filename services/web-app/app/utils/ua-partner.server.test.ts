import { beforeEach, describe, expect, test } from 'bun:test';
import {
  commitUaPartnerContext,
  destroyUaPartnerContext,
  getUaPartnerContext,
  isUaStudentBillingEnabled,
} from './ua-partner.server';

describe('UA partner context', () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
    delete process.env.UA_STUDENT_BILLING_ENABLED;
    delete process.env.UA_ORGANIZATION_ID;
  });

  test('is disabled unless both the flag and organization are configured', () => {
    expect(isUaStudentBillingEnabled()).toBe(false);
    process.env.UA_STUDENT_BILLING_ENABLED = 'true';
    expect(isUaStudentBillingEnabled()).toBe(false);
    process.env.UA_ORGANIZATION_ID = 'org-ua';
    expect(isUaStudentBillingEnabled()).toBe(true);
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
  });

  test('rejects an unsigned browser-supplied partner value', async () => {
    const context = await getUaPartnerContext(
      new Request('https://yawp.school/auth/login', {
        headers: { cookie: 'yawp_partner=ua' },
      })
    );

    expect(context).toBeNull();
  });

  test('expires the partner cookie when the UA journey ends', async () => {
    const header = await destroyUaPartnerContext(
      new Request('https://yawp.school/auth/logout')
    );

    expect(header).toContain('yawp_partner=');
    expect(header).toContain('Max-Age=0');
  });
});
