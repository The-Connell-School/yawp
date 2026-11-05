import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireUserId = mock(async () => 'user-1');
const getClassCodeAvailability = mock(async () => ({
  enforcementEnabled: true,
  available: true,
  normalizedCode: 'ABC123',
}));

mock.module('~/utils/auth.server', () => ({ requireUserId }));
mock.module('~/utils/class-code-availability.server', () => ({
  getClassCodeAvailability,
}));
mock.module('~/utils/db.server', () => ({ prisma: {} }));

const { loader } = await import('./route');

describe('api.class-code-availability loader', () => {
  beforeEach(() => {
    requireUserId.mockReset();
    getClassCodeAvailability.mockReset();
    requireUserId.mockResolvedValue('user-1');
    getClassCodeAvailability.mockResolvedValue({
      enforcementEnabled: true,
      available: false,
      normalizedCode: 'DUPE12',
    });
  });

  test('requires a signed-in user and forwards query params', async () => {
    const response = await loader({
      request: new Request(
        'https://example.test/api/class-code-availability?code=dupe12&excludeClassId=class-9'
      ),
    } as any);

    expect(requireUserId).toHaveBeenCalled();
    expect(getClassCodeAvailability).toHaveBeenCalledWith(
      {},
      'dupe12',
      { excludeClassId: 'class-9' }
    );
    expect((response as any).data).toEqual({
      enforcementEnabled: true,
      available: false,
      normalizedCode: 'DUPE12',
    });
  });
});
