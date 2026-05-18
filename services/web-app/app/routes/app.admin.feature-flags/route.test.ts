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
    prisma.organization.findMany.mockReset();
    prisma.organization.findUnique.mockReset();
    prisma.school.findMany.mockReset();
    prisma.school.findUnique.mockReset();
    prisma.setting.findMany.mockReset();

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
});
