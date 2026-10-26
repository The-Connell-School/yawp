import { describe, expect, test } from 'bun:test';
import { isPlatformLegacyAssignmentAdminEnabledForEnv } from './platform-legacy-assignment-admin-rollout';

describe('platform legacy assignment admin rollout', () => {
  test('is on for demo and PR preview deployments without a prod flag flip', () => {
    expect(
      isPlatformLegacyAssignmentAdminEnabledForEnv(
        { YAWP_ENVIRONMENT: 'demo' },
        false
      )
    ).toBe(true);
    expect(
      isPlatformLegacyAssignmentAdminEnabledForEnv(
        { PREVIEW_SLUG: 'demo' },
        false
      )
    ).toBe(true);
    expect(
      isPlatformLegacyAssignmentAdminEnabledForEnv(
        { YAWP_ENVIRONMENT: 'preview' },
        false
      )
    ).toBe(true);
  });

  test('is off on production until the feature flag is enabled', () => {
    expect(
      isPlatformLegacyAssignmentAdminEnabledForEnv(
        { YAWP_ENVIRONMENT: 'production', NODE_ENV: 'production' },
        false
      )
    ).toBe(false);
    expect(
      isPlatformLegacyAssignmentAdminEnabledForEnv(
        { YAWP_ENVIRONMENT: 'production', NODE_ENV: 'production' },
        true
      )
    ).toBe(true);
  });
});
