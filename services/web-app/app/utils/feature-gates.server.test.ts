import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  featureFlag: {
    findMany: mock(),
  },
};

mock.restore();
mock.module('~/utils/db.server', () => ({ prisma }));

const featureGatesModulePath = './feature-gates.server.ts?feature-gates-test';
const {
  FEATURE_KEYS,
  isFeatureEnabledForOrganization,
  isWritingPracticeEnabledForOrganization,
} = await import(featureGatesModulePath);

describe('feature gates', () => {
  beforeEach(() => {
    prisma.featureFlag.findMany.mockReset();
  });

  test('defaults a missing organization gate to disabled', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([]);

    await expect(
      isWritingPracticeEnabledForOrganization('org-1')
    ).resolves.toBe(false);

    expect(prisma.featureFlag.findMany).toHaveBeenCalledWith({
      where: {
        key: FEATURE_KEYS.WRITING_PRACTICE,
        OR: [
          { scopeKind: 'global', scopeId: '*' },
          { scopeKind: 'organization', scopeId: 'org-1' },
        ],
      },
      select: { scopeKind: true, scopeId: true, enabled: true },
    });
  });

  test('uses the global gate when an organization has no override', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { scopeKind: 'global', scopeId: '*', enabled: true },
    ]);

    await expect(
      isFeatureEnabledForOrganization(
        FEATURE_KEYS.WRITING_PRACTICE,
        'org-1'
      )
    ).resolves.toBe(true);
  });

  test('lets an organization override the global gate', async () => {
    prisma.featureFlag.findMany.mockResolvedValue([
      { scopeKind: 'global', scopeId: '*', enabled: true },
      { scopeKind: 'organization', scopeId: 'org-1', enabled: false },
    ]);

    await expect(
      isWritingPracticeEnabledForOrganization('org-1')
    ).resolves.toBe(false);
  });
});
