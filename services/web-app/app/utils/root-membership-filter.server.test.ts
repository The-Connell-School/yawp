import { describe, expect, mock, test } from 'bun:test';
import { getRootMembershipWhere } from './root-membership-filter.server';

const options = {
  userId: 'user-1',
  internal: null,
  previewAccessSeat: { organizationId: 'demo-seat-org' },
  isolatedPreviewSeatMode: true,
};

describe('root membership filter', () => {
  test('keeps the internal session filter even for an allowed user', async () => {
    const allowed = mock(async () => true);
    expect(await getRootMembershipWhere({
      ...options,
      internal: { membershipId: 'internal-membership', organizationId: 'internal-org' },
    }, allowed)).toEqual({
      id: 'internal-membership', organizationId: 'internal-org', isActive: true,
    });
    expect(allowed).not.toHaveBeenCalled();
  });

  test('does not filter an allowed user in isolated seat mode', async () => {
    const allowed = mock(async () => true);
    expect(await getRootMembershipWhere(options, allowed)).toBeUndefined();
    expect(allowed).toHaveBeenCalledWith('user-1');
  });

  test('keeps the seat filter for a user who is not allowed', async () => {
    expect(await getRootMembershipWhere(options, async () => false)).toEqual({
      organizationId: 'demo-seat-org',
    });
  });

  test('does not filter in non-isolated mode', async () => {
    const allowed = mock(async () => false);
    expect(await getRootMembershipWhere({
      ...options, isolatedPreviewSeatMode: false,
    }, allowed)).toBeUndefined();
    expect(allowed).not.toHaveBeenCalled();
  });

  test('does not filter when there is no preview seat', async () => {
    const allowed = mock(async () => false);
    expect(await getRootMembershipWhere({
      ...options, previewAccessSeat: null,
    }, allowed)).toBeUndefined();
    expect(allowed).not.toHaveBeenCalled();
  });
});
