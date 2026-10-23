import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as emailCopyServer from './email-copy.server';

type AdminApprovalUrlArgs = {
  approveUrl: string;
  notRightPersonUrl: string;
};

const sendFreeTierAdminApprovalEmail = mock(
  async (_args: AdminApprovalUrlArgs) => ({ ok: true as const })
);
const recordFreeTierAdminApprovalEmailLogged = mock(
  async (_args: AdminApprovalUrlArgs) => ({
    ok: true as const,
  })
);
const approvalUpdate = mock(async () => ({}));
const mintSignedLink = mock(async () => ({
  token: 'prod-approve-token',
  linkId: 'prod-approve-link',
}));
const mintSignedLinkForDevPanel = mock(async () => ({
  token: 'dev-approve-token',
  linkId: 'dev-approve-link',
}));

mock.module('~/domain/free-tier/class-preparation.server', () => ({
  isClassPreparationEnabled: async () => false,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  isFeatureFlagEnabled: async () => true,
}));
mock.module('./email-copy.server', () => ({
  ...emailCopyServer,
  adminApprovalEmailCopyVersionHash: async () => 'hash',
}));
mock.module('./email.server', () => ({
  sendFreeTierAdminApprovalEmail,
  recordFreeTierAdminApprovalEmailLogged,
  sendFreeTierAdminReminderEmail: async () => ({ ok: true as const }),
  sendFreeTierCongratulationsEmail: async () => ({ ok: true as const }),
  sendFreeTierReleaseEmail: async () => ({ ok: true as const }),
}));
mock.module('./signed-link.server', () => ({
  mintSignedLink,
  mintSignedLinkForDevPanel,
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
    sendFreeTierAdminApprovalEmail.mockClear();
    recordFreeTierAdminApprovalEmailLogged.mockClear();
    approvalUpdate.mockClear();
    mintSignedLink.mockClear();
    mintSignedLinkForDevPanel.mockClear();
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    process.env.YAWP_ENVIRONMENT = 'production';
  });

  test('uses dev minter and relative logged URLs when suppressEmailDelivery is set', async () => {
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
    expect(mintSignedLinkForDevPanel).toHaveBeenCalled();
    expect(mintSignedLink).not.toHaveBeenCalled();
    expect(sendFreeTierAdminApprovalEmail).not.toHaveBeenCalled();
    expect(recordFreeTierAdminApprovalEmailLogged).toHaveBeenCalledTimes(1);
    const logged = recordFreeTierAdminApprovalEmailLogged.mock.calls[0]![0]!;
    expect(logged.approveUrl).toMatch(/^\/free\/admin\//);
    expect(logged.notRightPersonUrl).toMatch(/^\/free\/admin\//);
    expect(logged.approveUrl).not.toMatch(/^https:/);
    expect(approvalUpdate).toHaveBeenCalled();
  });

  test('uses production minter and absolute email URLs when suppressEmailDelivery is false', async () => {
    const { submitAdminDetails } = await import('./approval-flow.server');
    const result = await submitAdminDetails({
      applicationId: 'app-1',
      userId: 'user-1',
      adminName: 'Admin',
      adminEmail: 'admin@example.test',
      adminRole: 'Principal',
      suppressEmailDelivery: false,
    });
    expect(result.ok).toBe(true);
    expect(mintSignedLink).toHaveBeenCalled();
    expect(mintSignedLinkForDevPanel).not.toHaveBeenCalled();
    expect(recordFreeTierAdminApprovalEmailLogged).not.toHaveBeenCalled();
    expect(sendFreeTierAdminApprovalEmail).toHaveBeenCalledTimes(1);
    const emailed = sendFreeTierAdminApprovalEmail.mock.calls[0]![0]!;
    expect(emailed.approveUrl).toMatch(/^https:\/\/yawp\.test\/free\/admin\//);
    expect(emailed.notRightPersonUrl).toMatch(
      /^https:\/\/yawp\.test\/free\/admin\//
    );
  });
});
