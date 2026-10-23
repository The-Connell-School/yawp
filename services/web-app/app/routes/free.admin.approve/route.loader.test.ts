import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
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
const applicationIdFromSignedToken = mock((): string | null => 'app-1');
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
  applicationIdFromSignedToken,
  isFreeTierLinkSigningConfigured: () => true,
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

const realSignedLink =
  globalThis.__realModules['~/domain/free-tier/signed-link.server'];

afterAll(() => {
  mock.restore();
  if (realSignedLink) {
    mock.module('~/domain/free-tier/signed-link.server', () => realSignedLink);
  }
});

beforeEach(() => {
  applicationIdFromSignedToken.mockReset();
  applicationIdFromSignedToken.mockReturnValue('app-1');
  peekSignedLink.mockReset();
  peekSignedLink.mockResolvedValue({
    ok: true,
    applicationId: 'app-1',
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

  test('forged token shows generic invalid copy without names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdFromSignedToken.mockReturnValue(null);
    linkReplacedGate.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=forged'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('unsigned token shows generic invalid copy without names', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdFromSignedToken.mockReturnValue(null);
    linkReplacedGate.mockResolvedValueOnce(null);
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=unsigned'),
      params: {},
      context: {},
    } as LoaderFunctionArgs);
    expect(data).toEqual({ ok: false, reason: 'invalid' });
  });

  test('bad-opaque token may name the request when structurally decodable', async () => {
    peekSignedLink.mockResolvedValueOnce({ ok: false, reason: 'invalid' });
    applicationIdFromSignedToken.mockReturnValue('app-1');
    terminalGate.mockResolvedValueOnce(null);
    linkReplacedGate.mockResolvedValueOnce(null);
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
    const data = await loader({
      request: new Request('https://yawp.test/free/admin/approve?t=bad-opaque'),
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
    applicationIdFromSignedToken.mockReturnValue('app-1');
    linkReplacedGate.mockResolvedValueOnce(null);
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
    const data = await loader({
      request: new Request(
        'https://yawp.test/free/admin/approve?t=purpose-mismatch'
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
