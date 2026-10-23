import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { ActionFunctionArgs } from 'react-router';

const redirectSchoolAdmin = mock();
const verifiedApplicationIdForAdminToken = mock(async () => null as string | null);
const terminalGate = mock(async () => null);
const findUnique = mock(async () => null as null | {
  name: string;
  schoolName: string;
  status: string;
});

mock.module('~/utils/db.server', () => ({
  prisma: { freeTierApplication: { findUnique } },
}));

mock.module('~/utils/free-tier/free-tier-feature-gate.server', () => ({
  requireFreeTierEnabled: async () => {},
}));

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  redirectSchoolAdmin,
}));

mock.module('~/domain/free-tier/admin-link-known-request.server', () => ({
  verifiedApplicationIdForAdminToken,
  applicationIdForAdminLinkNaming: async () => null,
}));

mock.module('~/domain/free-tier/admin-link-gate.server', () => ({
  fetchFreeTierApplicationTerminalGate: terminalGate,
  resolveAdminLinkReplacedGate: async () => null,
  resolveAdminLinkTerminalGate: async () => null,
}));

const { action } = await import('./route');

afterAll(() => mock.restore());

beforeEach(() => {
  redirectSchoolAdmin.mockReset();
  verifiedApplicationIdForAdminToken.mockReset();
  verifiedApplicationIdForAdminToken.mockResolvedValue(null);
  terminalGate.mockReset();
  findUnique.mockReset();
});

describe('free.admin.not-right-person action', () => {
  test('superseded with bad-opaque token does not leak names', async () => {
    redirectSchoolAdmin.mockResolvedValueOnce({
      ok: false,
      reason: 'superseded',
    });
    verifiedApplicationIdForAdminToken.mockResolvedValueOnce(null);
    const form = new FormData();
    form.set('token', 'bad');
    form.set('adminName', 'New Admin');
    form.set('adminEmail', 'new@example.test');
    const result = await action({
      request: new Request('https://yawp.test/free/admin/not-right-person', {
        method: 'POST',
        body: form,
      }),
      params: {},
      context: {},
    } as ActionFunctionArgs);
    expect(result).toEqual({ ok: false, reason: 'superseded' });
    expect(findUnique).not.toHaveBeenCalled();
  });
});
