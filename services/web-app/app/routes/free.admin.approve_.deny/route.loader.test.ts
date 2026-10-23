import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const peekSignedLink = mock();
const applicationIdForAdminLinkNaming = mock(
  async (
    _token: string,
    peek: { ok: true; applicationId: string } | { ok: false; reason: string }
  ): Promise<string | null> => (peek.ok ? peek.applicationId : null)
);
const terminalGate = mock(async () => null as null | {
  reason: string;
  schoolName: string;
  teacherName: string;
});
const denyAnsweredGate = mock(async () => null as null | {
  reason: 'admin_denied';
  schoolName: string;
  teacherName: string;
  decidedAt: Date;
});
const findUnique = mock(async () => null as null | {
  name: string;
  schoolName: string;
});

mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique } },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink,
}));

mock.module('~/domain/free-tier/admin-link-known-request.server', () => ({
  applicationIdForAdminLinkNaming,
}));

mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: terminalGate,
  resolveAdminLinkReplacedGate: async () => null,
}));

mock.module('~/domain/free-tier/approval-deny.server', () => ({
  resolveAdminDenyAnsweredGate: denyAnsweredGate,
  denySchoolAdminApproval: async () => ({ ok: false, reason: 'invalid' }),
}));

const { loader } = await import('./route');

afterAll(() => mock.restore());

beforeEach(() => {
  peekSignedLink.mockReset();
  applicationIdForAdminLinkNaming.mockReset();
  applicationIdForAdminLinkNaming.mockImplementation(async (_t, peek) =>
    peek.ok ? peek.applicationId : null
  );
  terminalGate.mockReset();
  terminalGate.mockResolvedValue(null);
  denyAnsweredGate.mockReset();
  denyAnsweredGate.mockResolvedValue(null);
  findUnique.mockReset();
});

describe('free.admin.approve_.deny loader', () => {
  test('approved application with bad-opaque token does not leak names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve/deny?t=bad'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
    expect(terminalGate).not.toHaveBeenCalled();
  });

  test('declined application with purpose_mismatch shows generic invalid', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: false,
      reason: 'purpose_mismatch',
    });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve/deny?t=x'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'purpose_mismatch' });
  });

  test('valid token on open request shows deny form', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: true,
      applicationId: 'app-1',
    });
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve/deny?t=valid'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toMatchObject({
      ok: true,
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
  });
});
