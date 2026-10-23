import { describe, expect, test } from 'bun:test';
import { devPanelFeedbackPath } from './dev-panel-feedback-path';

describe('devPanelFeedbackPath', () => {
  test('allows public, auth, free-tier and in-app paths without sensitive query values', () => {
    expect(devPanelFeedbackPath('/free')).toBe('/free');
    expect(devPanelFeedbackPath('/free?token=secret')).toBe('/free');
    expect(devPanelFeedbackPath('/auth/login?password=secret')).toBe('/auth/login');
    expect(
      devPanelFeedbackPath('/app/free-tier/pending?code=abc')
    ).toBe('/app/free-tier/pending');
    expect(devPanelFeedbackPath('/app/assignments?search=private#token')).toBe(
      '/app/assignments'
    );
  });

  test('rejects external, malformed and disallowed paths', () => {
    for (const path of [
      'https://demo.yawp.school/app',
      '//evil/app',
      '/api/internal/private',
      '/app\\secret',
      '/app/%zz',
    ]) {
      expect(devPanelFeedbackPath(path)).toBeNull();
    }
  });
});
