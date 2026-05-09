import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  isAssignmentsEnabledForOrganization,
  isReleasedGradesOrganizationEnabledForOrganization,
} = await import('./feature-flags.server');

describe('isAssignmentsEnabledForOrganization', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
  });

  test('returns false when organizationId is null', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });
    const result = await isAssignmentsEnabledForOrganization(null);
    expect(result).toBe(false);
  });

  test('returns false when organizationId is undefined', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });
    const result = await isAssignmentsEnabledForOrganization(undefined);
    expect(result).toBe(false);
  });

  test('returns false when setting does not exist', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    const result = await isAssignmentsEnabledForOrganization('org-1');
    expect(result).toBe(false);
  });

  test('returns false when org ID is not in the list', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-2,org-3',
      valueType: 'string',
    });
    const result = await isAssignmentsEnabledForOrganization('org-1');
    expect(result).toBe(false);
  });

  test('returns true when org ID is in the list', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1,org-2,org-3',
      valueType: 'string',
    });
    const result = await isAssignmentsEnabledForOrganization('org-1');
    expect(result).toBe(true);
  });

  test('returns true when org ID is the only one in the list', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });
    const result = await isAssignmentsEnabledForOrganization('org-1');
    expect(result).toBe(true);
  });
});

describe('isReleasedGradesOrganizationEnabledForOrganization', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
  });

  test('returns false when flag setting absent', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    const result =
      await isReleasedGradesOrganizationEnabledForOrganization('org-1');
    expect(result).toBe(false);
  });

  test('returns true when org id is in the allowlist setting value', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1,org-2',
      valueType: 'string',
    });
    const result =
      await isReleasedGradesOrganizationEnabledForOrganization('org-1');
    expect(result).toBe(true);
  });

  test('returns false when org id not in allowlist', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-2',
      valueType: 'string',
    });
    const result =
      await isReleasedGradesOrganizationEnabledForOrganization('org-1');
    expect(result).toBe(false);
  });

  test('returns false when organizationId is null', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });
    const result =
      await isReleasedGradesOrganizationEnabledForOrganization(null);
    expect(result).toBe(false);
  });
});
