import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

const isFeatureFlagEnabled = mock(async () => false);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled,
}));

const { isPlatformLegacyAssignmentAdminEnabled } = await import(
  './platform-legacy-assignment-admin.server'
);

const envKeys = [
  'PREVIEW_SLUG',
  'YAWP_ENVIRONMENT',
  'NODE_ENV',
] as const;

function saveEnv() {
  return Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const key of envKeys) {
    if (snapshot[key] === undefined) delete process.env[key];
    else process.env[key] = snapshot[key];
  }
}

describe('platform legacy assignment admin flag', () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = saveEnv();
    isFeatureFlagEnabled.mockReset();
    isFeatureFlagEnabled.mockResolvedValue(false);
  });

  afterEach(() => {
    restoreEnv(envSnapshot);
  });

  test('is on for demo deployments without a prod flag flip', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';

    await expect(isPlatformLegacyAssignmentAdminEnabled()).resolves.toBe(true);
    expect(isFeatureFlagEnabled).not.toHaveBeenCalled();
  });

  test('is off on production until the feature flag is enabled', async () => {
    const snapshot = saveEnv();
    try {
      delete process.env.PREVIEW_SLUG;
      delete process.env.YAWP_ENVIRONMENT;
      process.env.YAWP_ENVIRONMENT = 'production';
      process.env.NODE_ENV = 'production';
      isFeatureFlagEnabled.mockResolvedValue(false);

      await expect(isPlatformLegacyAssignmentAdminEnabled()).resolves.toBe(false);

      isFeatureFlagEnabled.mockResolvedValue(true);
      await expect(isPlatformLegacyAssignmentAdminEnabled()).resolves.toBe(true);
    } finally {
      restoreEnv(snapshot);
    }
  });
});
