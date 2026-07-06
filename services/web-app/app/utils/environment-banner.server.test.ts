import { describe, expect, test } from 'bun:test';
import {
  getEnvironmentBannerWarning,
  shouldEnableLocalDevQuickLogin,
} from './environment-banner.server';

describe('environment banner detection', () => {
  test('treats configured preview containers as preview environments', () => {
    expect(
      getEnvironmentBannerWarning(
        'https://pr-182.preview.yawp.school/app',
        { YAWP_ENVIRONMENT: 'preview' }
      )
    ).toBe('preview');
  });

  test('keeps localhost quick login enabled when local dev auth is available', () => {
    expect(
      shouldEnableLocalDevQuickLogin({
        bannerWarning: 'localhost',
        localDevAuthEnabled: true,
      })
    ).toBe(true);
  });

  test('enables quick login for preview seed environments', () => {
    expect(
      shouldEnableLocalDevQuickLogin({
        bannerWarning: 'preview',
        localDevAuthEnabled: true,
      })
    ).toBe(true);
  });

  test('does not enable quick login for staging', () => {
    expect(
      shouldEnableLocalDevQuickLogin({
        bannerWarning: 'staging',
        localDevAuthEnabled: true,
      })
    ).toBe(false);
  });
});
