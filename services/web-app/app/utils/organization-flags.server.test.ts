import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  organizationFlag: {
    findUnique: mock(),
  },
};

mock.restore();
mock.module('~/utils/db.server', () => ({ prisma }));

const organizationFlagsModulePath =
  './organization-flags.server.ts?organization-flags-test';
const {
  ORGANIZATION_FLAG_KEYS,
  isOrganizationFlagEnabledForOrganization,
  isWritingPracticeEnabledForOrganization,
} = await import(organizationFlagsModulePath);

describe('organization flags', () => {
  beforeEach(() => {
    prisma.organizationFlag.findUnique.mockReset();
  });

  test('defaults a missing organization flag to disabled', async () => {
    prisma.organizationFlag.findUnique.mockResolvedValue(null);

    await expect(
      isWritingPracticeEnabledForOrganization('org-1')
    ).resolves.toBe(false);

    expect(prisma.organizationFlag.findUnique).toHaveBeenCalledWith({
      where: {
        key_organizationId: {
          key: ORGANIZATION_FLAG_KEYS.WRITING_PRACTICE,
          organizationId: 'org-1',
        },
      },
      select: { enabled: true },
    });
  });

  test('reads the organization flag without falling back to a global flag', async () => {
    prisma.organizationFlag.findUnique.mockResolvedValue({ enabled: true });

    await expect(
      isOrganizationFlagEnabledForOrganization(
        ORGANIZATION_FLAG_KEYS.WRITING_PRACTICE,
        'org-1'
      )
    ).resolves.toBe(true);

    expect(prisma.organizationFlag.findUnique).toHaveBeenCalledTimes(1);
  });

  test('does not query flags without an organization id', async () => {
    await expect(
      isWritingPracticeEnabledForOrganization(null)
    ).resolves.toBe(false);

    expect(prisma.organizationFlag.findUnique).not.toHaveBeenCalled();
  });
});
