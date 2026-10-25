import { afterAll, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const resolveForward = mock(async () => 'forward.token.opaque');
const peekSignedLink = mock(async () => ({
  ok: true,
  applicationId: 'app-1',
  linkId: 'approve-link',
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findUnique: async () => ({
        schoolName: 'Lincoln High School',
        name: 'Jordan Rivera',
        email: 'j@example.test',
      }),
    },
  },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink,
}));

mock.module('~/domain/free-tier/admin-link-known-request.server', () => ({
  applicationIdForAdminLinkNaming: async () => 'app-1',
}));

mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: async () => null,
  resolveAdminLinkReplacedGate: async () => null,
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));

mock.module('~/domain/free-tier/approval-deny.server', () => ({
  resolveAdminDenyAnsweredGate: async () => null,
}));

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: async () => ({ ok: true }),
}));

mock.module('~/domain/free-tier/admin-approve-forward-link.server', () => ({
  resolveAdminForwardTokenForApproveLink: resolveForward,
  buildAdminForwardPageSearch: (forwardToken: string, approveToken: string) =>
    `?t=${encodeURIComponent(forwardToken)}&approveT=${encodeURIComponent(approveToken)}`,
}));

const { loader } = await import('./route');

afterAll(() => mock.restore());

test('loader resolves ADMIN_NOT_RIGHT_PERSON forward token separate from approve token', async () => {
  const data = await loader({
    request: new Request(
      'https://yawp.test/free/admin/approve?t=approve.token.opaque'
    ),
    params: {},
    context: {},
  } as LoaderFunctionArgs);
  expect(data).toMatchObject({
    ok: true,
    token: 'approve.token.opaque',
    forwardToken: 'forward.token.opaque',
  });
  expect(resolveForward).toHaveBeenCalledWith({
    approveToken: 'approve.token.opaque',
    applicationId: 'app-1',
    approveLinkId: 'approve-link',
  });
  expect(data.ok && 'forwardToken' in data && data.forwardToken).not.toBe(
    data.ok && 'token' in data ? data.token : null
  );
});
