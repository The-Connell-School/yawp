import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const findUnique = mock();
const findFirst = mock(async () => null);
const peekSignedLink = mock();
const fetchGate = mock();
const applicationIdForAdminLinkNaming = mock(
  async (
    _token: string,
    peek: { ok: boolean; applicationId?: string }
  ): Promise<string | null> =>
    peek.ok ? (peek.applicationId ?? 'app-1') : null
);

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
  applicationIdFromSignedToken: () => null,
}));

mock.module('~/domain/free-tier/admin-link-known-request.server', () => ({
  applicationIdForAdminLinkNaming,
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
const realKnownRequest =
  globalThis.__realModules['~/domain/free-tier/admin-link-known-request.server'];

afterAll(() => {
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
    if (peek.ok) return peek.applicationId ?? 'app-1';
    if (peek.reason === 'expired') return null;
    return null;
  });
  peekSignedLink.mockReset();
  fetchGate.mockReset();
  findUnique.mockReset();
});

describe('free.admin.not-right-person loader', () => {
  test('valid token on open request shows teacher and school', async () => {
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
      request: new Request('https://yawp.test/free/admin/not-right-person?t=valid'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toMatchObject({
      ok: true,
      schoolName: 'TS High',
      teacherName: 'Jordan Rivera',
    });
  });

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

  test('declined application with bad-opaque token shows generic invalid copy', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=bad-opaque'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
    expect(fetchGate).not.toHaveBeenCalled();
  });

  test('declined application with purpose_mismatch shows generic without names', async () => {
    peekSignedLink.mockResolvedValueOnce({
      ok: false,
      reason: 'purpose_mismatch',
    });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=purpose-mismatch'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('expired token with bad opaque shows generic invalid copy', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    applicationIdForAdminLinkNaming.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=expired-bad'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('expired token with verified opaque shows names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'expired' });
    applicationIdForAdminLinkNaming.mockImplementation(async (_t, peek) =>
      peek.reason === 'expired' ? 'app-1' : null
    );
    findUnique.mockResolvedValueOnce({
      schoolName: 'TS High',
      name: 'Jordan Rivera',
    });
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/not-right-person?t=expired-good'
      ),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({
      ok: false,
      reason: 'expired',
      schoolName: 'TS High',
      teacherName: 'Jordan Rivera',
    });
  });
});
