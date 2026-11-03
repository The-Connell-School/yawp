import { describe, expect, test } from 'bun:test';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';

describe('devPanelFeedbackPath', () => {
  test('accepts any in-app pathname and returns pathname only', () => {
    expect(devPanelFeedbackPath('/free')).toBe('/free');
    expect(devPanelFeedbackPath('/join/waitlist')).toBe('/join/waitlist');
    expect(devPanelFeedbackPath('/enter-code')).toBe('/enter-code');
    expect(devPanelFeedbackPath('/no-membership')).toBe('/no-membership');
    expect(devPanelFeedbackPath('/accessibility')).toBe('/accessibility');
    expect(devPanelFeedbackPath('/ua/preview')).toBe('/ua/preview');
    expect(devPanelFeedbackPath('/billing/plan')).toBe('/billing/plan');
    expect(devPanelFeedbackPath('/app/assignments?search=private#token')).toBe(
      '/app/assignments'
    );
  });

  test('rejects external, api, and malformed paths', () => {
    for (const path of [
      'https://demo.yawp.school/app',
      '//evil/app',
      '/api/dev-panel/feedback',
      '/app\\secret',
      '/app/%zz',
    ]) {
      expect(devPanelFeedbackPath(path)).toBeNull();
    }
  });
});
