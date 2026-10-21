import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

const findUnique = mock(async () => null);
const findFirst = mock(async () => null);

beforeAll(() => mock.restore());
afterAll(() => mock.restore());

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: { findUnique },
    freeTierSignedLink: { findUnique },
    freeTierAdminApproval: { findFirst },
  },
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  applicationIdFromSignedToken: () => 'app-1',
  peekSignedLink: async () => ({ ok: false, reason: 'invalid' }),
}));

const { resolveAdminLinkReplacedGate } = await import('./admin-link-gate.server');

describe('resolveAdminLinkReplacedGate', () => {
  test('returns link_replaced for superseded peek while request is open', async () => {
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      status: 'SENT',
    });
    const gate = await resolveAdminLinkReplacedGate({
      token: 'fixture-token',
      peek: { ok: false, reason: 'superseded' },
    });
    expect(gate).toEqual({
      reason: 'link_replaced',
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
  });

  test('already approved application yields no link_replaced gate', async () => {
    findUnique.mockResolvedValueOnce({
      name: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
      status: 'APPROVED',
    });
    const gate = await resolveAdminLinkReplacedGate({
      token: 'fixture-token',
      peek: { ok: false, reason: 'superseded' },
    });
    expect(gate).toBeNull();
  });
});
