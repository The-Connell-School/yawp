import { describe, expect, test } from 'bun:test';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';

describe('dev panel feedback submission contract', () => {
  test('accepts signed-out friendly public paths for API payloads', () => {
    expect(devPanelFeedbackPath('/free')).toBe('/free');
    expect(devPanelFeedbackPath('/auth/login')).toBe('/auth/login');
    expect(devPanelFeedbackPath('/app/assignments')).toBe('/app/assignments');
  });
});
