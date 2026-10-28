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
    expect(
      await getRootMembershipWhere(
        {
          ...options,
          internal: {
            membershipId: 'internal-membership',
            organizationId: 'internal-org',
          },
        },
        allowed
      )
    ).toEqual({
      id: 'internal-membership',
      organizationId: 'internal-org',
      isActive: true,
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
      isActive: true,
    });
  });

  test('filters inactive memberships in production when no other filter applies', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousYawpEnv = process.env.YAWP_ENVIRONMENT;
    process.env.NODE_ENV = 'production';
    delete process.env.YAWP_ENVIRONMENT;
    try {
      expect(
        await getRootMembershipWhere(
          { ...options, previewAccessSeat: null },
          async () => true
        )
      ).toEqual({ isActive: true });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
      if (previousYawpEnv === undefined) delete process.env.YAWP_ENVIRONMENT;
      else process.env.YAWP_ENVIRONMENT = previousYawpEnv;
    }
  });

  test('does not filter in non-isolated mode', async () => {
    const allowed = mock(async () => false);
    expect(
      await getRootMembershipWhere(
        {
          ...options,
          isolatedPreviewSeatMode: false,
        },
        allowed
      )
    ).toBeUndefined();
    expect(allowed).not.toHaveBeenCalled();
  });

  test('does not filter when there is no preview seat', async () => {
    const allowed = mock(async () => false);
    expect(
      await getRootMembershipWhere(
        {
          ...options,
          previewAccessSeat: null,
        },
        allowed
      )
    ).toBeUndefined();
    expect(allowed).not.toHaveBeenCalled();
  });
});
