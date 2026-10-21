import { afterAll, describe, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const terminalGate = mock(
  async (): Promise<{
    reason: 'already_approved' | 'declined';
    schoolName: string;
    teacherName: string;
  } | null> => null
);
const peekSignedLink = mock(
  async (): Promise<
    | { ok: true; applicationId: string }
    | { ok: false; reason: string }
  > => ({
    ok: true,
    applicationId: 'app-1',
  })
);
const linkReplacedGate = mock(
  async (): Promise<{
    reason: 'link_replaced';
    schoolName: string;
    teacherName: string;
  } | null> => null
);

mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique: async () => null } },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink,
  applicationIdFromSignedToken: () => 'app-1',
  isFreeTierLinkSigningConfigured: () => true,
}));

mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: terminalGate,
  resolveAdminLinkTerminalGate: async () => null,
  resolveAdminLinkReplacedGate: linkReplacedGate,
}));

afterAll(() => mock.restore());

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: async () => ({ ok: true }),
}));

const { loader } = await import('./route');

describe('free.admin.approve loader', () => {
  test('does not offer the approve form when the application was rejected', async () => {
    terminalGate.mockResolvedValueOnce({
      reason: 'declined',
      schoolName: 'Declined High',
      teacherName: 'Teacher',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=token'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'declined',
      schoolName: 'Declined High',
      teacherName: 'Teacher',
    });
  });

  test('already approved takes precedence over link replaced', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: false,
      reason: 'superseded',
    });
    terminalGate.mockResolvedValueOnce({
      reason: 'already_approved',
      schoolName: 'Lincoln High School',
      teacherName: 'Jordan Rivera',
    });
    linkReplacedGate.mockResolvedValueOnce({
      reason: 'link_replaced',
      schoolName: 'Lincoln High School',
      teacherName: 'Jordan Rivera',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=token'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'already_approved',
      schoolName: 'Lincoln High School',
      teacherName: 'Jordan Rivera',
    });
    expect(linkReplacedGate).not.toHaveBeenCalled();
  });
});
