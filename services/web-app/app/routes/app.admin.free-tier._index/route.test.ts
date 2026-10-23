import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireSuperAdmin = mock();
const requireFreeTierEnabled = mock();

mock.module('~/utils/auth.server', () => ({
  requireSuperAdmin,
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled,
}));

const { action, loader } = await import('./route');

describe('admin free tier moved route', () => {
  beforeEach(() => {
    requireSuperAdmin.mockReset();
    requireFreeTierEnabled.mockReset();
    requireSuperAdmin.mockResolvedValue({ id: 'admin-1' });
    requireFreeTierEnabled.mockResolvedValue(undefined);
  });

  test('requires enabled free tier and superadmin but returns moved state only', async () => {
    const response = await loader({
      request: new Request('https://example.test/app/admin/free-tier'),
      params: {},
    } as never);

    expect(requireFreeTierEnabled).toHaveBeenCalledTimes(1);
    expect(requireSuperAdmin).toHaveBeenCalledTimes(1);
    expect(response.data).toEqual({ moved: true });
  });

  test('rejects legacy mutations as moved', async () => {
    const response = await action({
      request: new Request('https://example.test/app/admin/free-tier', { method: 'POST' }),
      params: {},
    } as never);

    expect(response.init?.status).toBe(410);
    expect(response.data).toMatchObject({
      ok: false,
      error: expect.stringContaining('moved to Yawp Internal'),
    });
  });
});
