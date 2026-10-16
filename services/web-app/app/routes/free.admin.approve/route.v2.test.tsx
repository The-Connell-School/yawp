import { afterAll, expect, mock, test } from 'bun:test';
mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));
mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findUnique: async () => ({
        id: 'app',
        userId: 'teacher',
        organizationId: null,
        status: 'SENT',
        schoolName: 'Lincoln High',
        name: 'Ms. Okafor',
        email: 'okafor@example.org',
      }),
    },
  },
}));
mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink: async () => ({ ok: true, applicationId: 'app' }),
}));
mock.module('~/domain/free-tier/approval-v2.server', () => ({
  isApprovalV2Enabled: async () => true,
  forwardApprovalByToken: async () => ({ ok: true, queued: true }),
}));
const approve = mock(async () => ({ ok: true }));
mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: approve,
}));
const { loader, action } = await import('./route');
afterAll(() => mock.restore());
test('valid signed administrator request includes flagged layout and teacher details', async () => {
  const result = await loader({
    request: new Request('http://localhost/free/admin/approve?t=token'),
  } as never);
  expect(result).toMatchObject({
    ok: true,
    approvalV2: true,
    teacherEmail: 'okafor@example.org',
  });
});
test('flagged approval rejects a blank role on the server without consuming a link', async () => {
  const result = await action({
    request: new Request('http://localhost/free/admin/approve', {
      method: 'POST',
      body: new URLSearchParams({
        token: 'token',
        adminRole: ' ',
        authorized: 'on',
      }),
    }),
  } as never);
  expect(result.ok).toBe(false);
  expect(approve).not.toHaveBeenCalled();
});
