import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const setFeatureFlagBoolean = mock();
const setTargetedFeatureFlagTarget = mock();

mock.module('~/utils/auth.server', () => ({ requireAdmin }));

mock.module('~/utils/feature-flags.server', () => ({
  TARGETED_FEATURE_FLAGS: {
    documentSubmission: {
      label: 'Document submission',
      settingName: 'document_submission_enabled_school_ids',
      targetKind: 'school',
      description: 'School IDs allowed to use document submission and grading',
      globalSettingName: 'document_submission_enabled',
      globalLabel: 'Enable for all schools',
      globalDescription:
        'Allow every school to use document submission and grading',
    },
    assignments: {
      label: 'Assignments',
      settingName: 'assignments_enabled_org_ids',
      targetKind: 'organization',
      description: 'Organization IDs allowed to use assignments',
    },
  },
  parseSettingIdList: (value: string | null | undefined) =>
    new Set(
      (value ?? '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  setFeatureFlagBoolean,
  setTargetedFeatureFlagTarget,
}));

const prisma = {
  class: {
    findMany: mock(),
    findUnique: mock(),
  },
  featureAccessTarget: {
    findMany: mock(),
    upsert: mock(),
  },
  organization: {
    findMany: mock(),
    findUnique: mock(),
  },
  school: {
    findMany: mock(),
    findUnique: mock(),
  },
  setting: {
    findMany: mock(),
  },
  teacherProfile: {
    findMany: mock(),
    findUnique: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { action: routeAction, loader: routeLoader } = await import('./route');
const action = routeAction as any;
const loader = routeLoader as any;

describe('admin feature flags route', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    setFeatureFlagBoolean.mockReset();
    setTargetedFeatureFlagTarget.mockReset();
    prisma.class.findMany.mockReset();
    prisma.class.findUnique.mockReset();
    prisma.featureAccessTarget.findMany.mockReset();
    prisma.featureAccessTarget.upsert.mockReset();
    prisma.organization.findMany.mockReset();
    prisma.organization.findUnique.mockReset();
    prisma.school.findMany.mockReset();
    prisma.school.findUnique.mockReset();
    prisma.setting.findMany.mockReset();
    prisma.teacherProfile.findMany.mockReset();
    prisma.teacherProfile.findUnique.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    setFeatureFlagBoolean.mockResolvedValue('true');
    setTargetedFeatureFlagTarget.mockResolvedValue('org-1,org-2');
    prisma.organization.findMany.mockResolvedValue([
      { id: 'org-1', name: 'Alpha Org' },
      { id: 'org-2', name: 'Beta Org' },
    ]);
    prisma.school.findMany.mockResolvedValue([
      {
        id: 'school-1',
        name: 'Alpha School',
        code: 'ALPHA',
        organizationId: 'org-1',
        organization: { name: 'Alpha Org' },
      },
    ]);
    prisma.teacherProfile.findMany.mockResolvedValue([
      {
        id: 'teacher-1',
        isActive: true,
        profile: {
          organization: { name: 'Alpha Org' },
          user: { email: 'ada@example.com', name: 'Ada Teacher' },
        },
      },
    ]);
    prisma.class.findMany.mockResolvedValue([
      {
        id: 'class-1',
        code: 'ENG-1',
        grade: '9',
        period: '1',
        schoolYear: '2025-2026',
        title: 'English 9',
        school: {
          name: 'Alpha School',
          organization: { name: 'Alpha Org' },
        },
      },
    ]);
    prisma.featureAccessTarget.findMany.mockResolvedValue([]);
    prisma.featureAccessTarget.upsert.mockResolvedValue({
      id: 'fat-1',
      featureKey: 'assignments',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      enabled: true,
      expiresAt: null,
      note: null,
    });
    prisma.setting.findMany.mockResolvedValue([
      {
        name: 'assignments_enabled_org_ids',
        value: 'org-1',
        valueType: 'string',
      },
      {
        name: 'document_submission_enabled',
        value: 'false',
        valueType: 'boolean',
      },
      {
        name: 'document_submission_enabled_school_ids',
        value: 'school-1',
        valueType: 'string',
      },
    ]);
  });

  test('loader blocks non-admin users', async () => {
    requireAdmin.mockRejectedValue(new Response('Forbidden', { status: 403 }));

    let thrown: Response | null = null;
    try {
      await loader({
        request: new Request('https://x.test/app/admin/feature-flags'),
        params: {},
        context: {} as never,
      });
    } catch (error) {
      thrown = error as Response;
    }

    expect(thrown?.status).toBe(403);
  });

  test('loader returns registered flags with target and global state', async () => {
    const result = await loader({
      request: new Request('https://x.test/app/admin/feature-flags'),
      params: {},
      context: {} as never,
    });
    const data = (result as { data: any }).data;

    expect(data.organizations).toHaveLength(2);
    expect(data.schools).toEqual([
      {
        id: 'school-1',
        name: 'Alpha School',
        code: 'ALPHA',
        organizationId: 'org-1',
        organizationName: 'Alpha Org',
      },
    ]);
    expect(data.flags).toMatchObject([
      {
        key: 'documentSubmission',
        enabledTargetIds: ['school-1'],
        globalEnabled: false,
      },
      {
        key: 'assignments',
        enabledTargetIds: ['org-1'],
        globalEnabled: false,
      },
    ]);
  });

  test('loader returns teacher and class pilot target rows for pilot features', async () => {
    prisma.featureAccessTarget.findMany.mockResolvedValue([
      {
        id: 'fat-assignments-teacher',
        featureKey: 'assignments',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: true,
        expiresAt: null,
        note: 'spring pilot',
      },
      {
        id: 'fat-doc-class',
        featureKey: 'document_submission_grading',
        targetKind: 'class',
        targetId: 'class-1',
        enabled: false,
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        note: null,
      },
      {
        id: 'fat-expired-assignments-class',
        featureKey: 'assignments',
        targetKind: 'class',
        targetId: 'class-1',
        enabled: true,
        expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        note: 'expired pilot',
      },
    ]);

    const result = await loader({
      request: new Request('https://x.test/app/admin/feature-flags'),
      params: {},
      context: {} as never,
    });
    const data = (result as { data: any }).data;

    expect(data.pilotTargetRows).toContainEqual({
      featureKey: 'assignments',
      featureLabel: 'Assignments',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      targetLabel: 'Ada Teacher',
      targetDetail: 'ada@example.com - Alpha Org',
      featureAccessTargetId: 'fat-assignments-teacher',
      enabled: true,
      expiresAt: null,
      note: 'spring pilot',
    });
    expect(data.pilotTargetRows).toContainEqual({
      featureKey: 'assignments',
      featureLabel: 'Assignments',
      targetKind: 'class',
      targetId: 'class-1',
      targetLabel: 'English 9',
      targetDetail: 'ENG-1 - Grade 9 - Period 1 - Alpha School - Alpha Org',
      featureAccessTargetId: 'fat-expired-assignments-class',
      enabled: false,
      expiresAt: '2020-01-01T00:00:00.000Z',
      note: 'expired pilot',
    });
    expect(data.pilotTargetRows).toContainEqual({
      featureKey: 'document_submission_grading',
      featureLabel: 'Document submission grading',
      targetKind: 'class',
      targetId: 'class-1',
      targetLabel: 'English 9',
      targetDetail: 'ENG-1 - Grade 9 - Period 1 - Alpha School - Alpha Org',
      featureAccessTargetId: 'fat-doc-class',
      enabled: false,
      expiresAt: '2026-06-01T00:00:00.000Z',
      note: null,
    });
    expect(data.pilotTargetRows).toHaveLength(4);
  });

  test('action toggles an organization target through the flag helper', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-2' });
    const body = new URLSearchParams({
      intent: 'toggle-target',
      flag: 'assignments',
      targetId: 'org-2',
      enabled: 'true',
    });

    const result = await action({
      request: new Request('https://x.test/app/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
      params: {},
      context: {} as never,
    });

    expect((result as { data: any }).data.success).toBe(true);
    expect(setTargetedFeatureFlagTarget).toHaveBeenCalledWith(
      'assignments',
      'org-2',
      true
    );
  });

  test('action toggles a global boolean setting through the flag helper', async () => {
    const body = new URLSearchParams({
      intent: 'toggle-global',
      flag: 'documentSubmission',
      enabled: 'true',
    });

    const result = await action({
      request: new Request('https://x.test/app/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
      params: {},
      context: {} as never,
    });

    expect((result as { data: any }).data.success).toBe(true);
    expect(setFeatureFlagBoolean).toHaveBeenCalledWith(
      'document_submission_enabled',
      true,
      'Allow every school to use document submission and grading'
    );
  });

  test('action upserts a teacher or class pilot target', async () => {
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-1' });
    const body = new URLSearchParams({
      intent: 'toggle-pilot-target',
      featureKey: 'assignments',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      enabled: 'false',
    });

    const result = await action({
      request: new Request('https://x.test/app/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
      params: {},
      context: {} as never,
    });

    expect((result as { data: any }).data.success).toBe(true);
    expect(prisma.featureAccessTarget.upsert).toHaveBeenCalledWith({
      where: {
        featureKey_targetKind_targetId: {
          featureKey: 'assignments',
          targetKind: 'teacher',
          targetId: 'teacher-1',
        },
      },
      create: {
        featureKey: 'assignments',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: false,
        expiresAt: null,
      },
      update: { enabled: false },
    });
  });

  test('action clears expiry when re-enabling a teacher or class pilot target', async () => {
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-1' });
    const body = new URLSearchParams({
      intent: 'toggle-pilot-target',
      featureKey: 'assignments',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      enabled: 'true',
    });

    const result = await action({
      request: new Request('https://x.test/app/admin/feature-flags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
      params: {},
      context: {} as never,
    });

    expect((result as { data: any }).data.success).toBe(true);
    expect(prisma.featureAccessTarget.upsert).toHaveBeenCalledWith({
      where: {
        featureKey_targetKind_targetId: {
          featureKey: 'assignments',
          targetKind: 'teacher',
          targetId: 'teacher-1',
        },
      },
      create: {
        featureKey: 'assignments',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: true,
        expiresAt: null,
      },
      update: { enabled: true, expiresAt: null },
    });
  });
});
