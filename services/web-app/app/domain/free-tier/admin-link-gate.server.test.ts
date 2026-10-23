import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import {
  linkReplacedBody,
  teacherAtSchool,
} from './admin-approval-copy';

const findUnique = mock(async (): Promise<Record<string, unknown> | null> => null);
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
      variant: 'resent',
      teacherName: 'Jordan Rivera',
      schoolName: 'Lincoln High School',
    });
  });

  test('superseded link after resend maps to S10b resent copy when pass1 is on', async () => {
    const teacherName = 'Jordan Rivera';
    const schoolName = 'Lincoln High School';
    findUnique.mockResolvedValueOnce({
      name: teacherName,
      schoolName,
      status: 'SENT',
    });
    const gate = await resolveAdminLinkReplacedGate({
      token: 'fixture-token',
      peek: { ok: false, reason: 'superseded' },
    });
    expect(gate?.variant).toBe('resent');
    expect(linkReplacedBody(teacherName, schoolName, 'resent', true)).toBe(
      `A newer link was sent for ${teacherAtSchool(teacherName, schoolName)}. Use the most recent email, or email support@yawp.school.`
    );
    expect(linkReplacedBody(teacherName, schoolName, 'forwarded', true)).toBe(
      `The request for ${teacherAtSchool(teacherName, schoolName)} was forwarded to someone else, so this link no longer works. Questions? Email support@yawp.school.`
    );
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
