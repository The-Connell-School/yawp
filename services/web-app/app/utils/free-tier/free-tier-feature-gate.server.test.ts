import { beforeEach, describe, expect, mock, test } from 'bun:test';

const isFreeTierEnabled = mock(async () => true);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));

const { isDemoFreeTierRouteOpen, requireFreeTierEnabled } = await import(
  './free-tier-feature-gate.server'
);

describe('requireFreeTierEnabled', () => {
  const oldPreviewSlug = process.env.PREVIEW_SLUG;
  const oldYawpEnvironment = process.env.YAWP_ENVIRONMENT;

  beforeEach(() => {
    if (oldPreviewSlug === undefined) delete process.env.PREVIEW_SLUG;
    else process.env.PREVIEW_SLUG = oldPreviewSlug;
    if (oldYawpEnvironment === undefined) delete process.env.YAWP_ENVIRONMENT;
    else process.env.YAWP_ENVIRONMENT = oldYawpEnvironment;
    isFreeTierEnabled.mockReset().mockResolvedValue(true);
  });

  test('recognizes the long-lived demo deployment override', () => {
    expect(isDemoFreeTierRouteOpen({ PREVIEW_SLUG: 'demo' })).toBe(true);
    expect(isDemoFreeTierRouteOpen({ YAWP_ENVIRONMENT: 'demo' })).toBe(true);
    expect(isDemoFreeTierRouteOpen({ YAWP_ENVIRONMENT: 'production' })).toBe(false);
  });

  test('allows when the flag is on', async () => {
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();
  });

  test('allows demo routes when the stored flag is off', async () => {
    process.env.YAWP_ENVIRONMENT = 'demo';
    isFreeTierEnabled.mockResolvedValue(false);
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();
    expect(isFreeTierEnabled).not.toHaveBeenCalled();
  });

  test('throws 404 when the flag is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    const thrown = await requireFreeTierEnabled().catch((error) => error);
    expect(thrown).toMatchObject({ type: 'DataWithResponseInit', init: { status: 404 } });
  });

  test('keeps production closed when the flag is off', async () => {
    process.env.YAWP_ENVIRONMENT = 'production';
    isFreeTierEnabled.mockResolvedValue(false);
    const thrown = await requireFreeTierEnabled().catch((error) => error);
    expect(thrown).toMatchObject({ type: 'DataWithResponseInit', init: { status: 404 } });
  });
});
