import { beforeEach, describe, expect, mock, test } from 'bun:test';

const sendEmail = mock(async () => ({ status: 'success' as const }));
const approvalUpdate = mock(async () => ({}));

mock.module('~/utils/email.server', () => ({ sendEmail }));
mock.module('~/domain/free-tier/class-preparation.server', () => ({
  isClassPreparationEnabled: async () => false,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));
mock.module('./email-copy.server', () => ({
  adminApprovalEmailCopyVersionHash: async () => 'hash',
}));
mock.module('./signed-link.server', () => ({
  mintSignedLink: async () => ({
    token: 'approve-token',
    linkId: 'approve-link',
  }),
  abandonMintedSignedLinks: async () => {},
  FREE_TIER_LINK_TTL_MS: 60_000,
}));
mock.module('./free-tier-public-url.server', () => ({
  freeTierPublicAppOrigin: () => 'https://yawp.test',
}));
mock.module('./usage-budget.server', () => ({
  resolveFreeTierRuntimeEnvironment: () => 'production',
}));

const tx = {
  $executeRaw: async () => {},
  freeTierApplication: {
    findUnique: async () => ({ status: 'ACCOUNT_CREATED' }),
    updateMany: async () => ({ count: 1 }),
    update: async () => ({}),
  },
  freeTierAdminApproval: {
    create: async () => ({ id: 'approval-1' }),
    update: approvalUpdate,
    delete: async () => ({}),
  },
};

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findFirst: async () => ({
        id: 'app-1',
        status: 'ACCOUNT_CREATED',
        email: 'teacher@example.test',
        name: 'Teacher',
        schoolName: 'School',
        organizationId: null,
        starterClassName: 'English 10',
        starterClassGrade: '10',
      }),
    },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    freeTierAdminApproval: { update: approvalUpdate },
    freeTierEmailLog: { create: async () => ({}) },
  },
}));

describe('submitAdminDetails suppressEmailDelivery', () => {
  beforeEach(() => {
    sendEmail.mockClear();
    approvalUpdate.mockClear();
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
  });

  test('logs approval without calling sendEmail when suppressEmailDelivery is set', async () => {
    const { submitAdminDetails } = await import('./approval-flow.server');
    const result = await submitAdminDetails({
      applicationId: 'app-1',
      userId: 'user-1',
      adminName: 'Admin',
      adminEmail: 'admin@example.test',
      adminRole: 'Principal',
      suppressEmailDelivery: true,
    });
    expect(result.ok).toBe(true);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(approvalUpdate).toHaveBeenCalled();
  });
});
