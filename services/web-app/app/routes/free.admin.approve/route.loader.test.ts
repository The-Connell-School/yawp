import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const terminalGate = mock(
  async (): Promise<{
    reason: 'already_approved' | 'declined';
    schoolName: string;
    teacherName: string;
  } | null> => null
);
const resolveAdminForwardTokenForApproveLink = mock(async () => 'forward-token');
const peekSignedLink = mock(
  async (): Promise<
    | { ok: true; applicationId: string; linkId: string }
    | { ok: false; reason: string }
  > => ({
    ok: true,
    applicationId: 'app-1',
    linkId: 'approve-link',
  })
);
const applicationIdForAdminLinkNaming = mock(
  async (
    _token: string,
    peek: { ok: true; applicationId: string } | { ok: false; reason: string }
  ): Promise<string | null> => (peek.ok ? peek.applicationId : null)
);
const linkReplacedGate = mock(
  async (): Promise<{
    reason: 'link_replaced';
    schoolName: string;
    teacherName: string;
  } | null> => null
);

const findUnique = mock(async () => null as null | { name: string; schoolName: string; email?: string });
mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique } },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink,
  applicationIdFromSignedToken: () => null,
  isFreeTierLinkSigningConfigured: () => true,
}));

mock.module('~/domain/free-tier/admin-link-known-request.server', () => ({
  applicationIdForAdminLinkNaming,
}));

mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: terminalGate,
  resolveAdminLinkTerminalGate: async () => null,
  resolveAdminLinkReplacedGate: linkReplacedGate,
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));

mock.module('~/domain/free-tier/approval-deny.server', () => ({
  resolveAdminDenyAnsweredGate: async () => null,
}));

mock.module('~/domain/free-tier/admin-approve-forward-link.server', () => ({
  resolveAdminForwardTokenForApproveLink,
}));

const realSignedLink =
  globalThis.__realModules['~/domain/free-tier/signed-link.server'];
const realKnownRequest =
  globalThis.__realModules['~/domain/free-tier/admin-link-known-request.server'];

afterAll(() => {
  mock.restore();
  if (realSignedLink) {
    mock.module('~/domain/free-tier/signed-link.server', () => realSignedLink);
  }
  if (realKnownRequest) {
    mock.module(
      '~/domain/free-tier/admin-link-known-request.server',
      () => realKnownRequest
    );
  }
});

beforeEach(() => {
  applicationIdForAdminLinkNaming.mockReset();
  applicationIdForAdminLinkNaming.mockImplementation(async (_t, peek) => {
    if (peek.ok) return peek.applicationId;
    return null;
  });
  resolveAdminForwardTokenForApproveLink.mockReset();
  resolveAdminForwardTokenForApproveLink.mockResolvedValue('forward-token');
  peekSignedLink.mockReset();
  peekSignedLink.mockResolvedValue({
    ok: true,
    applicationId: 'app-1',
    linkId: 'approve-link',
  });
  terminalGate.mockReset();
  terminalGate.mockResolvedValue(null);
  linkReplacedGate.mockReset();
  linkReplacedGate.mockResolvedValue(null);
  findUnique.mockReset();
  findUnique.mockResolvedValue(null);
});

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  completeSchoolAdminApproval: async () => ({ ok: true }),
  redirectSchoolAdmin: async () => ({ ok: false, reason: 'invalid' }),
}));

const { loader } = await import('./route');

describe('free.admin.approve loader', () => {
  test('valid token on open request shows teacher and school', async () => {
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      email: 'j@example.test',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=valid'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toMatchObject({
      ok: true,
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      forwardToken: 'forward-token',
    });
    expect(resolveAdminForwardTokenForApproveLink).toHaveBeenCalledWith({
      approveToken: 'valid',
      applicationId: 'app-1',
      approveLinkId: 'approve-link',
    });
  });

  test('does not offer the approve form when the application was rejected', async () => {
    applicationIdForAdminLinkNaming.mockResolvedValueOnce('app-1');
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
    applicationIdForAdminLinkNaming.mockResolvedValueOnce('app-1');
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

  test('approved application with bad-opaque token shows generic invalid copy', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=bad-opaque'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
    expect(terminalGate).not.toHaveBeenCalled();
  });

  test('approved application with purpose_mismatch token shows generic invalid copy', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: false,
      reason: 'purpose_mismatch',
    });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/approve?t=purpose-mismatch'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
    expect(terminalGate).not.toHaveBeenCalled();
  });

  test('declined application with forged token shows generic invalid copy', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=forged'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('expired token with bad opaque shows generic invalid copy', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=expired-bad'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('expired token with verified opaque shows names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    applicationIdForAdminLinkNaming.mockImplementation(async (_t, peek) =>
      !peek.ok && peek.reason === 'expired' ? 'app-1' : null
    );
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=expired-good'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'expired',
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
  });
});
