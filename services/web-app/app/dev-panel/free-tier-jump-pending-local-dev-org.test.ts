import { describe, expect, mock, test } from 'bun:test';
import { FREE_TIER_JUMP_GENERIC_ERROR } from './free-tier-jump-messages';

/**
 * Bryant cold proof (localhost:3150 @ 54107ad0e): pending.* + throwaway + local-dev-org
 * returned HTTP 400 { error: "Couldn't jump to this state." } while signup/approved/lifecycle OK.
 * Illegal state transitions and prisma failures map to that same client string.
 */
const submitAdminDetails = mock(async () => ({
  ok: true as const,
  status: 'SENT' as const,
}));

const saveClassPreparation = mock(async () => ({ ok: true as const }));

const provisionFreeClassroom = mock(async () => ({
  status: 'provisioned' as const,
  organizationId: 'org-fc-pending-1',
}));

let lastPendingUserCreate: { email: string; hadSeatMembership: boolean } | null =
  null;

mock.module('~/domain/free-tier/approval-flow.server', () => ({
  submitAdminDetails,
}));

mock.module('~/domain/free-tier/class-preparation.server', () => ({
  saveClassPreparation,
}));

mock.module('~/domain/free-tier/locked-preview.server', () => ({
  ensureLockedPreviewClassroomForUser: async () => {
    await provisionFreeClassroom('app-pending-1');
    return { status: 'provisioned', organizationId: 'org-fc-pending-1' };
  },
}));

mock.module('~/domain/free-tier/provision-free-classroom.server', () => ({
  provisionFreeClassroom,
}));

mock.module('~/domain/free-tier/signed-link.server', () => ({
  mintSignedLinkForDevPanel: async () => ({ token: 't', linkId: 'link-1' }),
  FREE_TIER_LINK_TTL_MS: 60_000,
}));

mock.module('~/cookie-session-storages/authentication.server', () => ({
  authSessionStorage: {
    getSession: async () => ({ get: () => null, unset: () => {} }),
    commitSession: async () => 'en_session=',
  },
}));

mock.module('~/cookies/membership-id.server', () => ({
  setMembershipId: async () => 'membership=',
}));

mock.module('./dev-panel-session.server', () => ({
  createDevPanelSessionHeaders: async () => new Headers(),
}));

mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        freeTierApplication: {
          findUnique: async () => null,
          upsert: async () => ({ id: 'app-pending-1', status: 'ACCOUNT_CREATED' }),
        },
        freeTierAdminApproval: {
          findMany: async () => [],
        },
        freeTierApprovalDelivery: {
          updateMany: async () => ({ count: 0 }),
        },
      }),
    user: {
      create: async (args: {
        data: { email?: string; memberships?: unknown };
      }) => {
        const email = String(args.data.email ?? '');
        lastPendingUserCreate = {
          email,
          hadSeatMembership: Boolean(args.data.memberships),
        };
        return { id: 'pending-user-1', email };
      },
    },
    freeTierApplication: {
      upsert: async () => ({ id: 'app-pending-1', status: 'ACCOUNT_CREATED' }),
      updateMany: async () => ({ count: 1 }),
    },
    orgMembership: {
      deleteMany: async () => ({ count: 0 }),
      findFirst: async ({
        where,
      }: {
        where?: { organization?: { plan?: string } };
      }) =>
        where?.organization?.plan === 'FREE_CLASSROOM'
          ? { id: 'mem-fc-pending-1' }
          : null,
    },
    session: { deleteMany: async () => ({ count: 0 }) },
  },
}));

const { executeFreeTierStateJump } = await import('./free-tier-jump.server');

describe('executeFreeTierStateJump pending throwaway (local-dev-org regression)', () => {
  test('pending.waiting-on-admin succeeds without seeding a dev-panel seat membership', async () => {
    submitAdminDetails.mockClear();
    lastPendingUserCreate = null;
    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: true,
      currentUserId: null,
      organizationId: 'local-dev-org',
    });
    expect(lastPendingUserCreate?.hadSeatMembership).toBe(false);
    expect(lastPendingUserCreate?.email).toMatch(
      /^dev-panel\+[0-9a-f-]{36}@pending-[0-9a-f-]{12}\.example\.test$/
    );
    expect(result).toMatchObject({
      ok: true,
      redirectTo: '/app/free-tier/pending',
    });
    expect(submitAdminDetails).toHaveBeenCalled();
  });

  test('pending.manual-review succeeds for local-dev-org throwaway', async () => {
    submitAdminDetails.mockImplementationOnce(async () => ({
      ok: true as const,
      status: 'MANUAL_REVIEW' as const,
    }));
    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.manual-review',
      throwaway: true,
      currentUserId: null,
      organizationId: 'local-dev-org',
    });
    expect(result).toMatchObject({
      ok: true,
      redirectTo: '/app/free-tier/pending',
    });
  });

  test('masks illegal pending setup failures as the generic client error (cold proof string)', async () => {
    submitAdminDetails.mockImplementationOnce(async () => {
      throw new Error('Illegal state transition: ACCOUNT_CREATED -> SENT');
    });
    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: true,
      currentUserId: null,
      organizationId: 'local-dev-org',
    });
    expect(result).toEqual({
      ok: false,
      error: FREE_TIER_JUMP_GENERIC_ERROR,
    });
  });
});
