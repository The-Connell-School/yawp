import { describe, expect, mock, test } from 'bun:test';

/**
 * Cold proof: dev-panel free-tier jump API can return 200 + redirectTo while the
 * landing route throws (GeneralErrorBoundary "Oops") when global free-tier flag
 * is off on localhost — app.free-tier/* calls requireFreeTierEnabled().
 */
const isFreeTierEnabled = mock(async () => false);

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFreeTierEnabled,
}));

describe('free-tier jump post-redirect gate', () => {
  test('pending redirect target loader is not 404-blocked under dev panel runtime', async () => {
    process.env.NODE_ENV = 'development';
    process.env.YAWP_ENVIRONMENT = 'development';
    process.env.DATABASE_URL = 'postgresql://localhost:5432/yawp_dev';

    const { requireFreeTierEnabled } = await import(
      '~/utils/free-tier/free-tier-feature-gate.server'
    );
    await expect(requireFreeTierEnabled()).resolves.toBeUndefined();

    const { loader: freeTierLayoutLoader } = await import(
      '~/routes/app.free-tier/route'
    );
    await expect(
      freeTierLayoutLoader({
        request: new Request('http://localhost/app/free-tier/pending'),
        params: {},
        context: {},
      } as never)
    ).resolves.toBeNull();
  });
});
