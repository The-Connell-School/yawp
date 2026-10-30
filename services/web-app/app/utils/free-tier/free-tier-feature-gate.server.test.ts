import { beforeEach, describe, expect, mock, test } from 'bun:test';

const isFreeTierEnabled = mock(async () => true);
const isDevPanelRuntimeEnabled = mock(() => false);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));
mock.module('~/dev-panel/dev-panel-runtime.server', () => ({
  isDevPanelRuntimeEnabled: () => isDevPanelRuntimeEnabled(),
}));

const { requireFreeTierEnabled } = await import('./free-tier-feature-gate.server');

describe('requireFreeTierEnabled', () => {
  const oldPreviewSlug = process.env.PREVIEW_SLUG;
  const oldYawpEnvironment = process.env.YAWP_ENVIRONMENT;
  const oldNodeEnv = process.env.NODE_ENV;
  const oldDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    if (oldPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
    else process.env.PREVIEW_SLUG = oldPreviewSlug;
    if (oldYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = oldYawpEnvironment;
    if (oldNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = oldNodeEnv;
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
    isFreeTierEnabled.mockReset().mockResolvedValue(true);
    isDevPanelRuntimeEnabled.mockReset().mockReturnValue(false);
  });

  test('allows when the flag is on', async () => {
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();
  });

  test('throws 404 when the flag is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    process.env.NODE_ENV = 'production';
    process.env.YAWP_ENVIRONMENT = 'production';
    const thrown = await requireFreeTierEnabled().catch((error) => error);
    expect(thrown).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 404 },
    });
  });

  test('allows /app/free-tier routes on localhost dev panel when global flag is off (post-jump landing)', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    isDevPanelRuntimeEnabled.mockReturnValue(true);
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();
    expect(isFreeTierEnabled).not.toHaveBeenCalled();
  });
});
