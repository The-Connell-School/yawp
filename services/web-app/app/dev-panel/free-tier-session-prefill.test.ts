import { describe, expect, test } from 'bun:test';
import {
  devPanelFtPrefillForEmail,
  isDevPanelFtTestEmail,
  mintDevPanelFtTestEmail,
} from './free-tier-session-prefill';

describe('free-tier session prefill', () => {
  test('mint produces ft-test disposable addresses', () => {
    const email = mintDevPanelFtTestEmail();
    expect(isDevPanelFtTestEmail(email)).toBe(true);
    expect(email).toMatch(/^ft-test\+[a-z0-9]+@yawp\.test$/);
  });

  test('prefill uses PE3 Dana Whitaker fixture fields', () => {
    const prefill = devPanelFtPrefillForEmail('ft-test+abcd@yawp.test');
    expect(prefill.email).toBe('ft-test+abcd@yawp.test');
    expect(prefill.name).toBe('Dana Whitaker');
    expect(prefill.schoolName).toBe('Lincoln High School');
  });
});
