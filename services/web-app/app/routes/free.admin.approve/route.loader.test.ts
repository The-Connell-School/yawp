import { describe, expect, mock, test } from 'bun:test';

const findUnique = mock();

mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique } },
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink: async () => ({
    ok: true,
    applicationId: 'app-1',
  }),
  applicationIdFromSignedToken: () => 'app-1',
  isFreeTierLinkSigningConfigured: () => true,
}));

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: async () => ({ ok: true }),
}));

const { loader } = await import('./route');

describe('free.admin.approve loader', () => {
  test('does not offer the approve form when the application was rejected', async () => {
    findUnique.mockResolvedValueOnce({
      schoolName: 'Declined High',
      name: 'Teacher',
      status: 'REJECTED',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=token'),
      params: {},
      context: {},
    });
    expect(data).toEqual({
      ok: false,
      reason: 'declined',
      schoolName: 'Declined High',
    });
  });
});
