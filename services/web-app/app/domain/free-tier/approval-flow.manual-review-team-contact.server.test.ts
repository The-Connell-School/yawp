import { beforeEach, describe, expect, mock, test } from 'bun:test';
import * as emailCopyServer from './email-copy.server';

const sendFreeTierAdminApprovalEmail = mock(async () => ({ ok: true as const }));
const sendManualReviewTeamContact = mock(async () => ({ ok: true as const }));

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
  recordFreeTierAdminApprovalEmailLogged: async () => ({ ok: true as const }),
  sendFreeTierAdminReminderEmail: async () => ({ ok: true as const }),
  sendFreeTierCongratulationsEmail: async () => ({ ok: true as const }),
  sendFreeTierReleaseEmail: async () => ({ ok: true as const }),
}));
mock.module('./team-contact.server', () => ({
  sendManualReviewTeamContact,
  TEAM_CONTACT_MANUAL_REVIEW_KIND: 'team_contact_manual_review',
}));
mock.module('./signed-link.server', () => ({
  mintSignedLink: async () => ({
    token: 'prod-approve-token',
    linkId: 'prod-approve-link',
  }),
  mintSignedLinkForDevPanel: async () => ({
    token: 'dev-approve-token',
    linkId: 'dev-approve-link',
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
    update: async () => ({}),
    delete: async () => ({}),
  },
};

const teacher = {
  id: 'app-1',
  status: 'ACCOUNT_CREATED' as const,
  email: 'teacher@school.edu',
  name: 'Teacher',
  schoolName: 'School',
  organizationId: null,
  starterClassName: 'English 10',
  starterClassGrade: '10',
};

mock.module('~/utils/db.server', () => ({
  prisma: {
    freeTierApplication: {
      findFirst: async () => teacher,
    },
    $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
    freeTierAdminApproval: { update: async () => ({}) },
    freeTierEmailLog: { create: async () => ({}) },
  },
}));

describe('submitAdminDetails manual review team contact', () => {
  beforeEach(() => {
    sendFreeTierAdminApprovalEmail.mockClear();
    sendManualReviewTeamContact.mockClear();
    process.env.FREE_TIER_LINK_HMAC_SECRET = 'unit-test-hmac-secret';
    process.env.PRIMARY_APP_URL = 'https://yawp.test';
    process.env.YAWP_ENVIRONMENT = 'production';
  });

  test('notifies team for consumer-domain administrator', async () => {
    const { submitAdminDetails } = await import('./approval-flow.server');
    const result = await submitAdminDetails({
      applicationId: 'app-1',
      userId: 'user-1',
      adminName: 'Admin',
      adminEmail: 'admin@gmail.com',
      adminRole: 'Principal',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe('MANUAL_REVIEW');
    expect(sendFreeTierAdminApprovalEmail).not.toHaveBeenCalled();
    expect(sendManualReviewTeamContact).toHaveBeenCalledTimes(1);
    expect(sendManualReviewTeamContact).toHaveBeenCalledWith(
      expect.objectContaining({
        holdReason: 'consumer_domain',
        adminEmail: 'admin@gmail.com',
      })
    );
  });

  test('notifies team for domain mismatch', async () => {
    const { submitAdminDetails } = await import('./approval-flow.server');
    const result = await submitAdminDetails({
      applicationId: 'app-1',
      userId: 'user-1',
      adminName: 'Admin',
      adminEmail: 'admin@other.edu',
      adminRole: 'Principal',
    });
    expect(result.ok).toBe(true);
    expect(sendManualReviewTeamContact).toHaveBeenCalledTimes(1);
    expect(sendManualReviewTeamContact).toHaveBeenCalledWith(
      expect.objectContaining({ holdReason: 'domain_mismatch' })
    );
  });

  test('same-domain path sends administrator email and skips team contact', async () => {
    const { submitAdminDetails } = await import('./approval-flow.server');
    const result = await submitAdminDetails({
      applicationId: 'app-1',
      userId: 'user-1',
      adminName: 'Admin',
      adminEmail: 'admin@school.edu',
      adminRole: 'Principal',
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.status).toBe('SENT');
    expect(sendFreeTierAdminApprovalEmail).toHaveBeenCalledTimes(1);
    expect(sendManualReviewTeamContact).not.toHaveBeenCalled();
  });

  test('suppressEmailDelivery skips team contact on manual review', async () => {
    const { submitAdminDetails } = await import('./approval-flow.server');
    await submitAdminDetails({
      applicationId: 'app-1',
      userId: 'user-1',
      adminName: 'Admin',
      adminEmail: 'admin@gmail.com',
      adminRole: 'Principal',
      suppressEmailDelivery: true,
    });
    expect(sendManualReviewTeamContact).not.toHaveBeenCalled();
  });
});