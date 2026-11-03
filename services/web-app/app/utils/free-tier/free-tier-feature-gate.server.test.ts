import { beforeEach, describe, expect, mock, test } from 'bun:test';

const isFreeTierEnabled = mock(async () => true);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));

const { requireFreeTierEnabled } = await import('./free-tier-feature-gate.server');

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

  test('allows when the flag is on', async () => {
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();
  });

  test('throws 404 when the flag is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    const thrown = await requireFreeTierEnabled().catch((error) => error);
    expect(thrown).toMatchObject({
      type: 'DataWithResponseInit',
      init: { status: 404 },
    });
  });
});
