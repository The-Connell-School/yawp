import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();
const requireUserId = mock();
const requireProfile = mock();
const setFeatureFlagBoolean = mock();
const setTargetedFeatureFlagTarget = mock();

mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireUserId,
  requireProfile,
}));

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
    requireUserId.mockReset();
    requireProfile.mockReset();
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

  test('loader returns teacher school and organization access rows for pilot features', async () => {
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
        id: 'fat-doc-school',
        featureKey: 'document_submission_grading',
        targetKind: 'school',
        targetId: 'school-1',
        enabled: false,
        expiresAt: new Date('2026-06-01T00:00:00.000Z'),
        note: null,
      },
      {
        id: 'fat-expired-assignments-org',
        featureKey: 'assignments',
        targetKind: 'organization',
        targetId: 'org-2',
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
      targetKind: 'organization',
      targetId: 'org-2',
      targetLabel: 'Beta Org',
      targetDetail: 'Organization',
      featureAccessTargetId: 'fat-expired-assignments-org',
      enabled: false,
      expiresAt: '2020-01-01T00:00:00.000Z',
      note: 'expired pilot',
    });
    expect(data.pilotTargetRows).toContainEqual({
      featureKey: 'document_submission_grading',
      featureLabel: 'Document submission grading',
      targetKind: 'school',
      targetId: 'school-1',
      targetLabel: 'Alpha School',
      targetDetail: 'ALPHA - Alpha Org',
      featureAccessTargetId: 'fat-doc-school',
      enabled: false,
      expiresAt: '2026-06-01T00:00:00.000Z',
      note: null,
    });
    expect(data.pilotTargetRows).toContainEqual({
      featureKey: 'ap_history_essay',
      featureLabel: 'AP History Essay',
      targetKind: 'teacher',
      targetId: 'teacher-1',
      targetLabel: 'Ada Teacher',
      targetDetail: 'ada@example.com - Alpha Org',
      featureAccessTargetId: null,
      enabled: false,
      expiresAt: null,
      note: null,
    });
    expect(data.pilotTargetRows).toHaveLength(12);
    expect(prisma.featureAccessTarget.findMany).toHaveBeenCalledWith({
      where: {
        featureKey: {
          in: [
            'assignments',
            'document_submission_grading',
            'ap_history_essay',
          ],
        },
        targetKind: { in: ['teacher', 'school', 'organization'] },
      },
      select: {
        id: true,
        featureKey: true,
        targetKind: true,
        targetId: true,
        enabled: true,
        expiresAt: true,
        note: true,
      },
      orderBy: [{ featureKey: 'asc' }, { targetKind: 'asc' }],
    });
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

  test('action upserts a teacher pilot target', async () => {
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
      update: { enabled: false, updatedAt: expect.any(Date) },
    });
  });

  test('action accepts an AP History pilot target', async () => {
    prisma.teacherProfile.findUnique.mockResolvedValue({ id: 'teacher-1' });
    const body = new URLSearchParams({
      intent: 'toggle-pilot-target',
      featureKey: 'ap_history_essay',
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
          featureKey: 'ap_history_essay',
          targetKind: 'teacher',
          targetId: 'teacher-1',
        },
      },
      create: {
        featureKey: 'ap_history_essay',
        targetKind: 'teacher',
        targetId: 'teacher-1',
        enabled: true,
        expiresAt: null,
      },
      update: { enabled: true, expiresAt: null, updatedAt: expect.any(Date) },
    });
  });

  test('action upserts a school pilot target', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-1' });
    const body = new URLSearchParams({
      intent: 'toggle-pilot-target',
      featureKey: 'document_submission_grading',
      targetKind: 'school',
      targetId: 'school-1',
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
          featureKey: 'document_submission_grading',
          targetKind: 'school',
          targetId: 'school-1',
        },
      },
      create: {
        featureKey: 'document_submission_grading',
        targetKind: 'school',
        targetId: 'school-1',
        enabled: true,
        expiresAt: null,
      },
      update: { enabled: true, expiresAt: null, updatedAt: expect.any(Date) },
    });
  });

  test('action upserts an organization pilot target', async () => {
    prisma.organization.findUnique.mockResolvedValue({ id: 'org-1' });
    const body = new URLSearchParams({
      intent: 'toggle-pilot-target',
      featureKey: 'assignments',
      targetKind: 'organization',
      targetId: 'org-1',
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
          targetKind: 'organization',
          targetId: 'org-1',
        },
      },
      create: {
        featureKey: 'assignments',
        targetKind: 'organization',
        targetId: 'org-1',
        enabled: true,
        expiresAt: null,
      },
      update: { enabled: true, expiresAt: null, updatedAt: expect.any(Date) },
    });
  });

  test('action rejects class pilot targets in the admin contract', async () => {
    const body = new URLSearchParams({
      intent: 'toggle-pilot-target',
      featureKey: 'assignments',
      targetKind: 'class',
      targetId: 'class-1',
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

    expect((result as { init: { status: number } }).init.status).toBe(400);
    expect((result as { data: any }).data.error).toBe(
      'Invalid pilot target kind.'
    );
    expect(prisma.featureAccessTarget.upsert).not.toHaveBeenCalled();
  });

  test('action clears expiry when re-enabling a teacher pilot target', async () => {
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
      update: { enabled: true, expiresAt: null, updatedAt: expect.any(Date) },
    });
  });
});
