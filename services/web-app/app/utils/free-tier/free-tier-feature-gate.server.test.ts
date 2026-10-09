import { beforeEach, describe, expect, mock, test } from 'bun:test';

const isFreeTierEnabled = mock(() => Promise.resolve(true));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));

const { requireFreeTierEnabled } = await import('./free-tier-feature-gate.server');

describe('requireFreeTierEnabled', () => {
  beforeEach(() => {
    isFreeTierEnabled.mockReset().mockResolvedValue(true);
  });

  test('allows when the flag is on', async () => {
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();
  });

  test('throws 404 when the flag is off', async () => {
    isFreeTierEnabled.mockResolvedValue(false);
    const thrown = await requireFreeTierEnabled().catch((error) => error);
    expect(thrown).toMatchObject({ type: 'DataWithResponseInit', init: { status: 404 } });
  });
});
