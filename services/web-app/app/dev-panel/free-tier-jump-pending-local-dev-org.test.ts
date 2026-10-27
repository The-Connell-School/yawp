import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from 'bun:test';
import * as emailCopyServer from '~/domain/free-tier/email-copy.server';
import { FREE_TIER_JUMP_GENERIC_ERROR } from './free-tier-jump-messages';

/**
 * Live regression (localhost:3150, worktree .env): pending jumps call real
 * submitAdminDetails → mintSignedLinkForDevPanel. Worktree env has SESSION_SECRET
 * but not FREE_TIER_LINK_HMAC_SECRET, so mint threw and the client saw generic 400.
 */
const savedEnv: Record<string, string | undefined> = {};

const recordFreeTierAdminApprovalEmailLogged = mock(async () => ({
  ok: true as const,
}));

const provisionFreeClassroom = mock(async () => ({
  status: 'provisioned' as const,
  organizationId: 'org-fc-pending-1',
}));

let pendingThrowawayEmail = 'dev-panel+00000000-0000-4000-8000-000000000001@pending-000000000001.example.test';

mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));

mock.module('~/domain/free-tier/email.server', () => ({
  sendFreeTierAdminApprovalEmail: async () => ({ ok: true as const }),
  recordFreeTierAdminApprovalEmailLogged,
  sendFreeTierAdminReminderEmail: async () => ({ ok: true as const }),
  sendFreeTierCongratulationsEmail: async () => ({ ok: true as const }),
  sendFreeTierReleaseEmail: async () => ({ ok: true as const }),
}));

mock.module('~/domain/free-tier/email-copy.server', () => ({
  ...emailCopyServer,
  adminApprovalEmailCopyVersionHash: async () => 'hash',
}));

mock.module('~/domain/free-tier/provision-free-classroom.server', () => ({
  provisionFreeClassroom,
}));

mock.module('~/domain/free-tier/locked-preview.server', () => ({
  ensureLockedPreviewClassroomForUser: async () => {
    await provisionFreeClassroom('app-pending-1');
    return { status: 'provisioned', organizationId: 'org-fc-pending-1' };
  },
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

const submitTx = {
  $executeRaw: async () => {},
  freeTierApplication: {
    findUnique: async () => ({ status: 'ACCOUNT_CREATED', id: 'app-pending-1' }),
    updateMany: async () => ({ count: 1 }),
    update: async () => ({}),
    upsert: async () => ({ id: 'app-pending-1', status: 'ACCOUNT_CREATED' }),
  },
  freeTierAdminApproval: {
    findMany: async () => [],
    deleteMany: async () => ({ count: 0 }),
    create: async () => ({ id: 'approval-1' }),
    update: async () => ({}),
    delete: async () => ({}),
  },
  freeTierApprovalDelivery: {
    updateMany: async () => ({ count: 0 }),
  },
  freeTierSignedLink: {
    create: async () => ({
      id: 'link-1',
      expiresAt: new Date(Date.now() + 60_000),
    }),
  },
};

mock.module('~/utils/db.server', () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof submitTx) => Promise<unknown>) =>
      fn(submitTx),
    user: {
      create: async (args: {
        data: { email?: string; memberships?: unknown };
      }) => {
        pendingThrowawayEmail = String(args.data.email ?? pendingThrowawayEmail);
        return {
          id: 'pending-user-1',
          email: pendingThrowawayEmail,
        };
      },
    },
    freeTierApplication: {
      findUnique: async () => null,
      findFirst: async () => ({
        id: 'app-pending-1',
        status: 'ACCOUNT_CREATED',
        email: pendingThrowawayEmail,
        name: 'Test Teacher',
        schoolName: 'Lincoln High School',
        location: 'Local',
        gradeLevel: '10',
        userId: 'pending-user-1',
        organizationId: null,
        starterClassName: 'English 10',
        starterClassGrade: '10',
      }),
      upsert: async () => ({ id: 'app-pending-1', status: 'ACCOUNT_CREATED' }),
      updateMany: async () => ({ count: 1 }),
    },
    orgMembership: {
      findFirst: async (args: {
        where?: {
          organization?: { plan?: string };
          organizationId?: string;
          userId?: string;
        };
      }) => {
        if (args.where?.organization?.plan === 'FREE_CLASSROOM') {
          return { id: 'mem-fc-pending-1' };
        }
        if (
          args.where?.organization?.plan &&
          'not' in (args.where.organization.plan as object)
        ) {
          return null;
        }
        return null;
      },
      deleteMany: async () => ({ count: 0 }),
    },
    freeTierAdminApproval: {
      findMany: async () => [],
      update: async () => ({}),
    },
    freeTierApprovalDelivery: {
      updateMany: async () => ({ count: 0 }),
    },
    freeTierEmailLog: { create: async () => ({}) },
    freeTierSignedLink: submitTx.freeTierSignedLink,
    session: { deleteMany: async () => ({ count: 0 }) },
    setting: { findUnique: async () => null },
  },
}));

function applyWorktreeLikeEnv() {
  savedEnv.FREE_TIER_LINK_HMAC_SECRET = process.env.FREE_TIER_LINK_HMAC_SECRET;
  savedEnv.NODE_ENV = process.env.NODE_ENV;
  savedEnv.YAWP_ENVIRONMENT = process.env.YAWP_ENVIRONMENT;
  savedEnv.SESSION_SECRET = process.env.SESSION_SECRET;
  delete process.env.FREE_TIER_LINK_HMAC_SECRET;
  process.env.NODE_ENV = 'development';
  process.env.YAWP_ENVIRONMENT = 'development';
  process.env.SESSION_SECRET = 'worktree-local-dev-session-secret';
}

function restoreEnv() {
  for (const key of [
    'FREE_TIER_LINK_HMAC_SECRET',
    'NODE_ENV',
    'YAWP_ENVIRONMENT',
    'SESSION_SECRET',
  ] as const) {
    const value = savedEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('executeFreeTierStateJump pending (localhost worktree env)', () => {
  beforeEach(() => {
    applyWorktreeLikeEnv();
    recordFreeTierAdminApprovalEmailLogged.mockClear();
    provisionFreeClassroom.mockClear();
  });

  afterEach(() => {
    restoreEnv();
  });

  test('pending.waiting-on-admin + local-dev-org uses real submitAdminDetails mint without FREE_TIER_LINK_HMAC_SECRET', async () => {
    const { executeFreeTierStateJump } = await import('./free-tier-jump.server');
    const result = await executeFreeTierStateJump({
      request: new Request('http://localhost/'),
      stateId: 'pending.waiting-on-admin',
      throwaway: true,
      currentUserId: null,
      organizationId: 'local-dev-org',
    });
    expect(result).toMatchObject({
      ok: true,
      redirectTo: '/app/free-tier/pending',
    });
    expect(recordFreeTierAdminApprovalEmailLogged).toHaveBeenCalled();
  });

  test('pending.waiting-on-admin returns generic 400 when no signing secret is available (live failure mode)', async () => {
    delete process.env.SESSION_SECRET;
    delete process.env.INTERNAL_COMMAND_TOKEN;
    delete process.env.FREE_TIER_LINK_HMAC_SECRET;
    const { isFreeTierLinkSigningConfigured } = await import(
      '~/domain/free-tier/signed-link.server'
    );
    expect(isFreeTierLinkSigningConfigured()).toBe(false);
    const { executeFreeTierStateJump } = await import('./free-tier-jump.server');
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

  test('pending.manual-review succeeds for local-dev-org throwaway', async () => {
    const { executeFreeTierStateJump } = await import('./free-tier-jump.server');
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
});
