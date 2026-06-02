import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  setting: {
    findUnique: mock(),
    upsert: mock(),
  },
  featureAccessTarget: {
    findFirst: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const {
  getAssignmentsEnabledClassIdsForContext,
  getTargetedFeatureFlagIds,
  isApHistoryEssayEnabledForContext,
  isAssignmentsEnabledForContext,
  isAssignmentsEnabledForOrganization,
  isDocumentSubmissionEnabledForScope,
  isReleasedGradesOrganizationEnabledForOrganization,
  isTargetedFeatureFlagEnabled,
  setFeatureFlagBoolean,
  setTargetedFeatureFlagTarget,
} = await import('./feature-flags.server');

describe('isAssignmentsEnabledForOrganization', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.featureAccessTarget.findFirst.mockReset();
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

describe('isAssignmentsEnabledForContext', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.featureAccessTarget.findFirst.mockReset();
  });

  test('keeps existing org allowlist behavior', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });

    const result = await isAssignmentsEnabledForContext({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classIds: ['class-1'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).not.toHaveBeenCalled();
  });

  test('allows a teacher pilot when no class scope is provided', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-2',
      valueType: 'string',
    });
    prisma.featureAccessTarget.findFirst.mockResolvedValue({ id: 'fat-1' });

    const result = await isAssignmentsEnabledForContext({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'assignments',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-1'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });

  test('allows a teacher target to enable a scoped class taught by that teacher', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            target.targetKind === 'teacher' &&
            target.targetId.in.includes('teacher-1')
        )
          ? { id: 'fat-teacher-1' }
          : null
    );

    const result = await isAssignmentsEnabledForContext({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      schoolIds: ['school-1'],
      classIds: ['class-2'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'assignments',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          { targetKind: 'school', targetId: { in: ['school-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-1'] } },
          { targetKind: 'class', targetId: { in: ['class-2'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });

  test('returns false when no broad flag or pilot target matches', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.featureAccessTarget.findFirst.mockResolvedValue(null);

    const result = await isAssignmentsEnabledForContext({
      organizationId: 'org-1',
      teacherProfileId: null,
      classIds: [],
    });

    expect(result).toBe(false);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'assignments',
        enabled: true,
        OR: [{ targetKind: 'organization', targetId: { in: ['org-1'] } }],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });
});

describe('getAssignmentsEnabledClassIdsForContext', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.featureAccessTarget.findFirst.mockReset();
  });

  test('returns every class when the organization is broadly enabled', async () => {
    prisma.setting.findUnique.mockResolvedValue({
      value: 'org-1',
      valueType: 'string',
    });

    const result = await getAssignmentsEnabledClassIdsForContext({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classes: [{ id: 'class-1' }, { id: 'class-2' }],
    });

    expect(result).toEqual(['class-1', 'class-2']);
    expect(prisma.featureAccessTarget.findFirst).not.toHaveBeenCalled();
  });

  test('does not use one broad organization allowlist for another organization class', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'assignments_enabled_org_ids') {
        return { value: 'org-1', valueType: 'string' };
      }
      return null;
    });
    prisma.featureAccessTarget.findFirst.mockResolvedValue(null);

    const result = await getAssignmentsEnabledClassIdsForContext({
      organizationId: 'org-1',
      teacherProfileId: 'teacher-1',
      classes: [
        { id: 'class-1', organizationId: 'org-1' },
        { id: 'class-2', organizationId: 'org-2' },
      ],
    });

    expect(result).toEqual(['class-1']);
  });

  test('filters mixed pilot and non-pilot classes per class', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            target.targetKind === 'class' &&
            target.targetId.in.includes('class-1')
        )
          ? { id: 'fat-class-1' }
          : null
    );

    const result = await getAssignmentsEnabledClassIdsForContext({
      organizationId: 'org-1',
      classes: [
        { id: 'class-1', teacherProfileIds: ['teacher-1'] },
        { id: 'class-2', teacherProfileIds: ['teacher-2'] },
      ],
    });

    expect(result).toEqual(['class-1']);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledTimes(2);
  });

  test('includes every class taught by a targeted teacher', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            target.targetKind === 'teacher' &&
            target.targetId.in.includes('teacher-1')
        )
          ? { id: 'fat-teacher-1' }
          : null
    );

    const result = await getAssignmentsEnabledClassIdsForContext({
      organizationId: 'org-1',
      classes: [
        {
          id: 'class-1',
          schoolId: 'school-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          id: 'class-2',
          schoolId: 'school-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          id: 'class-3',
          schoolId: 'school-1',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });

    expect(result).toEqual(['class-1', 'class-2']);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledTimes(3);
  });

  test('includes classes enabled by school and organization access targets', async () => {
    prisma.setting.findUnique.mockResolvedValue(null);
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            (target.targetKind === 'school' &&
              target.targetId.in.includes('school-2')) ||
            (target.targetKind === 'organization' &&
              target.targetId.in.includes('org-3'))
        )
          ? { id: 'fat-scope' }
          : null
    );

    const result = await getAssignmentsEnabledClassIdsForContext({
      organizationId: 'org-1',
      classes: [
        {
          id: 'class-1',
          organizationId: 'org-1',
          schoolId: 'school-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          id: 'class-2',
          organizationId: 'org-2',
          schoolId: 'school-2',
          teacherProfileIds: ['teacher-2'],
        },
        {
          id: 'class-3',
          organizationId: 'org-3',
          schoolId: 'school-3',
          teacherProfileIds: ['teacher-3'],
        },
      ],
    });

    expect(result).toEqual(['class-2', 'class-3']);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledTimes(3);
  });
});

describe('isApHistoryEssayEnabledForContext', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.featureAccessTarget.findFirst.mockReset();
  });

  test('returns true when an AP History pilot target matches any context scope', async () => {
    prisma.featureAccessTarget.findFirst.mockResolvedValue({ id: 'fat-ap-1' });

    const result = await isApHistoryEssayEnabledForContext({
      organizationId: 'org-1',
      schoolIds: ['school-1', 'school-2'],
      teacherProfileId: 'teacher-1',
      teacherProfileIds: ['teacher-2'],
      classIds: ['class-1'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'ap_history_essay',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          {
            targetKind: 'school',
            targetId: { in: ['school-1', 'school-2'] },
          },
          {
            targetKind: 'teacher',
            targetId: { in: ['teacher-1', 'teacher-2'] },
          },
          { targetKind: 'class', targetId: { in: ['class-1'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });

  test('returns false when no AP History pilot target matches', async () => {
    prisma.featureAccessTarget.findFirst.mockResolvedValue(null);

    const result = await isApHistoryEssayEnabledForContext({
      organizationId: 'org-1',
      schoolIds: ['school-1'],
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });

    expect(result).toBe(false);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'ap_history_essay',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          { targetKind: 'school', targetId: { in: ['school-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-1'] } },
          { targetKind: 'class', targetId: { in: ['class-1'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });
});

describe('isDocumentSubmissionEnabledForScope', () => {
  beforeEach(() => {
    prisma.setting.findUnique.mockReset();
    prisma.setting.upsert.mockReset();
    prisma.featureAccessTarget.findFirst.mockReset();
  });

  test('keeps global document submission behavior', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'true', valueType: 'boolean' };
      }
      return null;
    });

    const result = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-1'],
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).not.toHaveBeenCalled();
  });

  test('keeps existing school allowlist behavior', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'false', valueType: 'boolean' };
      }
      if (where.name === 'document_submission_enabled_school_ids') {
        return { value: 'school-1,school-2', valueType: 'string' };
      }
      return null;
    });

    const result = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-1'],
      teacherProfileIds: ['teacher-1'],
      classIds: ['class-1'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).not.toHaveBeenCalled();
  });

  test('allows a teacher pilot when no class scope is provided', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'false', valueType: 'boolean' };
      }
      if (where.name === 'document_submission_enabled_school_ids') {
        return { value: 'school-2', valueType: 'string' };
      }
      return null;
    });
    prisma.featureAccessTarget.findFirst.mockResolvedValue({ id: 'fat-1' });

    const result = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-1'],
      teacherProfileIds: ['teacher-1'],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'document_submission_grading',
        enabled: true,
        OR: [
          { targetKind: 'school', targetId: { in: ['school-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-1'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });

  test('allows a teacher target to enable a document class scope taught by that teacher', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'false', valueType: 'boolean' };
      }
      if (where.name === 'document_submission_enabled_school_ids') {
        return { value: '', valueType: 'string' };
      }
      return null;
    });
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            target.targetKind === 'teacher' &&
            target.targetId.in.includes('teacher-1')
        )
          ? { id: 'fat-teacher-1' }
          : null
    );

    const result = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-1'],
      classScopes: [
        {
          schoolId: 'school-1',
          classId: 'class-2',
          organizationId: 'org-1',
          teacherProfileIds: ['teacher-1'],
        },
      ],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'document_submission_grading',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          { targetKind: 'school', targetId: { in: ['school-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-1'] } },
          { targetKind: 'class', targetId: { in: ['class-2'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
  });

  test('allows a multi-class practice document when any class scope is enabled', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'false', valueType: 'boolean' };
      }
      if (where.name === 'document_submission_enabled_school_ids') {
        return { value: '', valueType: 'string' };
      }
      return null;
    });
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            target.targetKind === 'class' &&
            target.targetId.in.includes('class-1')
        )
          ? { id: 'fat-class-1' }
          : null
    );

    const result = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-1', 'school-2'],
      classIds: ['class-1', 'class-2'],
      teacherProfileIds: ['teacher-1', 'teacher-2'],
      classScopes: [
        {
          schoolId: 'school-1',
          classId: 'class-1',
          organizationId: 'org-1',
          teacherProfileIds: ['teacher-1'],
        },
        {
          schoolId: 'school-2',
          classId: 'class-2',
          organizationId: 'org-2',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });

    expect(result).toBe(true);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledTimes(1);
  });

  test('allows document submission through school and organization access targets', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'false', valueType: 'boolean' };
      }
      if (where.name === 'document_submission_enabled_school_ids') {
        return { value: '', valueType: 'string' };
      }
      return null;
    });
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            (target.targetKind === 'school' &&
              target.targetId.in.includes('school-2')) ||
            (target.targetKind === 'organization' &&
              target.targetId.in.includes('org-3'))
        )
          ? { id: 'fat-scope' }
          : null
    );

    const schoolResult = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-2'],
      organizationIds: ['org-2'],
      classScopes: [
        {
          schoolId: 'school-2',
          classId: 'class-2',
          organizationId: 'org-2',
          teacherProfileIds: ['teacher-2'],
        },
      ],
    });
    const orgResult = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-3'],
      organizationIds: ['org-3'],
      classScopes: [
        {
          schoolId: 'school-3',
          classId: 'class-3',
          organizationId: 'org-3',
          teacherProfileIds: ['teacher-3'],
        },
      ],
    });

    expect(schoolResult).toBe(true);
    expect(orgResult).toBe(true);
  });

  test('does not let a different teacher target enable actor-scoped grading', async () => {
    prisma.setting.findUnique.mockImplementation(async ({ where }) => {
      if (where.name === 'document_submission_enabled') {
        return { value: 'false', valueType: 'boolean' };
      }
      if (where.name === 'document_submission_enabled_school_ids') {
        return { value: '', valueType: 'string' };
      }
      return null;
    });
    prisma.featureAccessTarget.findFirst.mockImplementation(
      async ({ where }) =>
        where.OR.some(
          (target: { targetKind: string; targetId: { in: string[] } }) =>
            target.targetKind === 'teacher' &&
            target.targetId.in.includes('teacher-enabled')
        )
          ? { id: 'fat-teacher-enabled' }
          : null
    );

    const result = await isDocumentSubmissionEnabledForScope({
      schoolIds: ['school-1'],
      organizationIds: ['org-1'],
      classScopes: [
        {
          schoolId: 'school-1',
          organizationId: 'org-1',
          classId: 'class-1',
          teacherProfileIds: ['teacher-actor', 'teacher-enabled'],
        },
      ],
      actorTeacherProfileId: 'teacher-actor',
    });

    expect(result).toBe(false);
    expect(prisma.featureAccessTarget.findFirst).toHaveBeenCalledWith({
      where: {
        featureKey: 'document_submission_grading',
        enabled: true,
        OR: [
          { targetKind: 'organization', targetId: { in: ['org-1'] } },
          { targetKind: 'school', targetId: { in: ['school-1'] } },
          { targetKind: 'teacher', targetId: { in: ['teacher-actor'] } },
          { targetKind: 'class', targetId: { in: ['class-1'] } },
        ],
        AND: [
          {
            OR: [{ expiresAt: null }, { expiresAt: { gt: expect.any(Date) } }],
          },
        ],
      },
      select: { id: true },
    });
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
        id: 'released_grades_organization_enabled_org_ids',
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
        id: 'document_submission_enabled_school_ids',
        name: 'document_submission_enabled_school_ids',
        description:
          'School IDs allowed to use document submission and grading',
        value: 'school-2',
        valueType: 'string',
      },
      update: {
        description:
          'School IDs allowed to use document submission and grading',
        value: 'school-2',
        valueType: 'string',
      },
    });
  });

  test('upserts a boolean feature flag setting', async () => {
    prisma.setting.upsert.mockResolvedValue({});

    const result = await setFeatureFlagBoolean(
      'document_submission_enabled',
      true,
      'Allow every school to use document submission and grading'
    );

    expect(result).toBe('true');
    expect(prisma.setting.upsert).toHaveBeenCalledWith({
      where: { name: 'document_submission_enabled' },
      create: {
        id: 'document_submission_enabled',
        name: 'document_submission_enabled',
        description:
          'Allow every school to use document submission and grading',
        value: 'true',
        valueType: 'boolean',
      },
      update: {
        description:
          'Allow every school to use document submission and grading',
        value: 'true',
        valueType: 'boolean',
      },
    });
  });
});
