import { describe, expect, mock, test } from 'bun:test';
import { FREE_TIER_LIMITS_SETTING } from '~/domain/free-tier/limits.server';

const settingUpsert = mock(async () => ({}));
const settingCreate = mock(async () => ({}));
const settingDeleteMany = mock(async () => ({ count: 0 }));
const limitsBefore = JSON.stringify({
  studentSeatCap: 10,
  lessonPlannerMonthly: 2,
  reporterMonthly: 1,
  version: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedByEmail: 'ops@example.test',
});
let limitsRow = limitsBefore;

mock.module('~/utils/db.server', () => ({
  prisma: {
    setting: {
      upsert: settingUpsert,
      create: settingCreate,
      deleteMany: settingDeleteMany,
      findUnique: async ({ where }: { where: { name: string } }) =>
        where.name === FREE_TIER_LIMITS_SETTING
          ? { value: limitsRow }
          : null,
    },
    user: {
      create: async () => ({
        id: 'user-1',
        email: 'test@yawp.local',
        memberships: [{ id: 'mem-1' }],
      }),
    },
    freeTierApplication: {
      upsert: async () => ({ id: 'app-1', status: 'APPROVED' }),
      findUniqueOrThrow: async () => ({ organizationId: 'org-1' }),
      update: async () => ({}),
    },
    orgMembership: {
      findFirst: async ({
        where,
      }: {
        where?: { organizationId?: string; userId?: string };
      }) =>
        where?.organizationId === 'org-fc-1'
          ? { id: 'mem-fc-1' }
          : null,
    },
    session: { deleteMany: async () => ({ count: 0 }) },
  },
}));
mock.module('~/domain/free-tier/provision-free-classroom.server', () => ({
  provisionFreeClassroom: async () => ({
    status: 'provisioned' as const,
    organizationId: 'org-fc-1',
  }),
}));
mock.module('~/domain/free-tier/signed-link.server', () => ({
  mintSignedLink: async () => ({ token: 't' }),
  FREE_TIER_LINK_TTL_MS: 60_000,
}));
mock.module('~/domain/free-tier/free-tier-public-url.server', () => ({
  freeTierPublicAppOrigin: () => 'http://localhost',
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

const {
  executeFreeTierStateJump,
  PENDING_STATES_NEED_THROWAWAY,
  FREE_TIER_JUMP_GENERIC_ERROR,
} = await import('./free-tier-jump.server');

describe('executeFreeTierStateJump pending guard', () => {
  test('refuses pending states without throwaway before writes', async () => {
    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: false,
      currentUserId: 'user-1',
      organizationId: 'org-1',
    });
    expect(result).toEqual({
      ok: false,
      error: PENDING_STATES_NEED_THROWAWAY,
    });
  });
});

describe('formatFreeTierJumpErrorForClient', () => {
  test('hides raw prisma failures', async () => {
    const { formatFreeTierJumpErrorForClient } = await import('./free-tier-jump-messages');
    expect(
      formatFreeTierJumpErrorForClient(
        new Error('Invalid prisma.freeTierApplication.upsert() invocation')
      )
    ).toBe(FREE_TIER_JUMP_GENERIC_ERROR);
    expect(formatFreeTierJumpErrorForClient(new Error(PENDING_STATES_NEED_THROWAWAY))).toBe(
      PENDING_STATES_NEED_THROWAWAY
    );
  });
});

describe('executeFreeTierStateJump monthly usage seeding', () => {
  test('does not upsert global free_tier.limits.v1', async () => {
    settingUpsert.mockClear();
    limitsRow = limitsBefore;
    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'approved.lesson-planner-limit',
      throwaway: true,
      currentUserId: null,
      organizationId: 'org-1',
    });
    expect(result.ok).toBe(true);
    const upsertCalls = settingUpsert.mock.calls as unknown as Array<
      [{ where?: { name?: string }; create?: { name?: string } }]
    >;
    expect(
      upsertCalls.some((call) => call[0]?.where?.name === FREE_TIER_LIMITS_SETTING)
    ).toBe(false);
    const limitsUpsert = upsertCalls.find(
      (call) => call[0]?.create?.name === FREE_TIER_LIMITS_SETTING
    );
    expect(limitsUpsert).toBeUndefined();
  });
});
