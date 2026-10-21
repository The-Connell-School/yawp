import { describe, expect, mock, test } from 'bun:test';
import type { LoaderFunctionArgs } from 'react-router';

const findUnique = mock();
const peekSignedLink = mock();
const fetchGate = mock();

mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique } },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  peekSignedLink,
  applicationIdFromSignedToken: () => 'app-1',
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
    });
    expect(peekSignedLink).toHaveBeenCalled();
  });
});
