import { afterAll, describe, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const findUnique = mock();
const findFirst = mock(async () => null);
const peekSignedLink = mock();
const fetchGate = mock();
const applicationIdFromSignedToken = mock((): string | null => 'app-1');

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: { findUnique },
    freeTierAdminApproval: { findFirst },
  },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink,
  applicationIdFromSignedToken,
}));

mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: fetchGate,
  resolveAdminLinkTerminalGate: async () => null,
  resolveAdminLinkReplacedGate: async () => null,
}));

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  redirectSchoolAdmin: async () => ({ ok: true }),
}));

const { loader } = await import('./route');

const realSignedLink =
  globalThis.__realModules['~/domain/free-tier/signed-link.server'];

afterAll(() => {
  if (realSignedLink) {
    mock.module('~/domain/free-tier/signed-link.server', () => realSignedLink);
  }
});

describe('free.admin.not-right-person loader', () => {
  test('shows already approved when application is approved even if peek succeeds', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: true,
      applicationId: 'app-1',
    });
    fetchGate.mockResolvedValueOnce({
      reason: 'already_approved',
      schoolName: 'TS High',
      teacherName: 'Jordan Rivera',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/not-right-person?t=token'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'already_approved',
      schoolName: 'TS High',
      teacherName: 'Jordan Rivera',
    });
  });

  test('HEAD requests use the same loader peek path as GET', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: true,
      applicationId: 'app-1',
    });
    fetchGate.mockResolvedValueOnce(null);
    findUnique.mockResolvedValueOnce({
      schoolName: 'TS High',
      name: 'Jordan Rivera',
    });
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=token',
        { method: 'HEAD' }
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: true,
      token: 'token',
      schoolName: 'TS High',
      teacherName: 'Jordan Rivera',
      approveBackToken: undefined,
      pendingAdminName: undefined,
    });
    expect(peekSignedLink).toHaveBeenCalled();
  });

  test('forged token shows generic invalid copy without names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdFromSignedToken.mockReturnValueOnce(null);
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=forged'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('unsigned token shows generic invalid copy without names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdFromSignedToken.mockReturnValueOnce(null);
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=unsigned'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('bad-opaque token may name the request when structurally decodable', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdFromSignedToken.mockReturnValueOnce('app-1');
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=bad-opaque'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'invalid',
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
  });

  test('purpose_mismatch token may name the request when structurally decodable', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: false,
      reason: 'purpose_mismatch',
    });
    applicationIdFromSignedToken.mockReturnValueOnce('app-1');
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=purpose-mismatch'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'invalid',
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
  });
});
