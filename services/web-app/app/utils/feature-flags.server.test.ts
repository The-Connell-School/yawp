import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
    upsert: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  getTargetedFeatureFlagIds,
  isAssignmentsEnabledForOrganization,
  isReleasedGradesOrganizationEnabledForOrganization,
  isTargetedFeatureFlagEnabled,
  setTargetedFeatureFlagTarget,
} = await import('./feature-flags.server');

describe('isAssignmentsEnabledForOrganization', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
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
    prisma.setting.upsert.mockReset();
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

describe('targeted feature flags', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
  });

  test('returns an empty set when the targeted setting is absent', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    const result = await getTargetedFeatureFlagIds('assignments');
    expect(Array.from(result)).toEqual([]);
  });

  test('checks the requested target id against the configured target list', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'school-1, school-2',
      valueType: 'string',
    });

    const result = await isTargetedFeatureFlagEnabled(
      'documentSubmission',
      'school-2'
    );

    expect(result).toBe(true);
  });

  test('upserts an enabled organization target without direct org table columns', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });
    prisma.setting.upsert.mockResolvedValue({});

    const result = await setTargetedFeatureFlagTarget(
      'releasedGradesOrganization',
      'org-2',
      true
    );

    expect(result).toBe('org-1,org-2');
    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { name: 'released_grades_organization_enabled_org_ids' },
      create: {
        name: 'released_grades_organization_enabled_org_ids',
        description:
          'Organization IDs allowed to use released grades organization view',
        value: 'org-1,org-2',
        valueType: 'string',
      },
      update: {
        description:
          'Organization IDs allowed to use released grades organization view',
        value: 'org-1,org-2',
        valueType: 'string',
      },
    });
  });

  test('removes a disabled school target from the existing setting value', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'school-1,school-2',
      valueType: 'string',
    });
    prisma.setting.upsert.mockResolvedValue({});

    const result = await setTargetedFeatureFlagTarget(
      'documentSubmission',
      'school-1',
      false
    );

    expect(result).toBe('school-2');
    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { name: 'document_submission_enabled_school_ids' },
      create: {
        name: 'document_submission_enabled_school_ids',
        description: 'School IDs allowed to use document submission and grading',
        value: 'school-2',
        valueType: 'string',
      },
      update: {
        description: 'School IDs allowed to use document submission and grading',
        value: 'school-2',
        valueType: 'string',
      },
    });
  });
});
