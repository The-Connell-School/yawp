import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  user: {
    findUnique: mock(),
    findFirst: mock(),
    findMany: mock(),
  },
  organization: { findMany: mock() },
  adminConfigAudit: { findUnique: mock(), findMany: mock(), findManyDistinct: mock() },
};

const requireAdmin = mock();
const requireSuperAdmin = mock();
const requireMutableRequest = mock();
const requireUserId = mock();
const getImpersonationState = mock();
const listFeatureFlags = mock();
const findUnknownOrganizationIds = mock();
const setFeatureFlag = mock();
const listAccessList = mock();
const addAccessListEntry = mock();
const removeAccessListEntry = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireAdmin,
  requireSuperAdmin,
  requireMutableRequest,
  requireUserId,
  getImpersonationState,
}));
mock.module('~/domain/feature-flags/feature-flags.server', () => ({
  listFeatureFlags,
  findUnknownOrganizationIds,
  setFeatureFlag,
}));
mock.module('~/domain/access-lists/access-lists.server', () => ({
  listAccessList,
  addAccessListEntry,
  removeAccessListEntry,
}));
const { loader, action } = await import('./route.server');

function loaderRequest(url = 'https://example.test/app/admin/access-flags') {
  return loader({
    request: new Request(url),
    params: {},
    context: {} as never,
  } as never);
}

function actionRequest(form: Record<string, string>) {
  const body = new URLSearchParams(form);
  return action({
    request: new Request('https://example.test/app/admin/access-flags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }),
    params: {},
    context: {} as never,
  } as never);
}

describe('access flags admin route', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    requireSuperAdmin.mockReset();
    requireMutableRequest.mockReset();
    requireUserId.mockReset();
    getImpersonationState.mockReset();
    listFeatureFlags.mockReset();
    findUnknownOrganizationIds.mockReset();
    setFeatureFlag.mockReset();
    listAccessList.mockReset();
    addAccessListEntry.mockReset();
    removeAccessListEntry.mockReset();
    prisma.adminConfigAudit.findMany.mockReset();
    prisma.user.findUnique.mockReset();
    prisma.user.findFirst.mockReset();
    prisma.user.findMany.mockReset();
    prisma.organization.findMany.mockReset();
    prisma.adminConfigAudit.findUnique.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireUserId.mockResolvedValue('admin-1');
    requireSuperAdmin.mockResolvedValue({
      id: 'admin-1',
      email: 'super@yawp.local',
    });
    requireMutableRequest.mockResolvedValue(undefined);
    getImpersonationState.mockResolvedValue({
      isReadOnly: false,
      impersonatorUserId: null,
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'admin-1',
      email: 'super@yawp.local',
      name: 'Super Admin',
      isSuperAdmin: true,
    });
    prisma.user.findMany.mockResolvedValue([]);
    listFeatureFlags.mockResolvedValue([
      {
        key: 'teacher-lounge',
        label: "Teacher's Lounge",
        description: 'Lounge',
        mode: 'off',
        orgIds: [],
        persisted: { mode: 'off', orgIds: [] },
        effective: { mode: 'off', orgIds: [] },
        runtimeOverride: null,
        enabled: false,
        updatedAt: null,
        lastChangedBy: null,
      },
    ]);
    findUnknownOrganizationIds.mockResolvedValue([]);
    listAccessList.mockResolvedValue([]);
    prisma.adminConfigAudit.findMany.mockResolvedValue([]);
  });

  test('loader exposes edit capability for super admins', async () => {
    const response = await loaderRequest();
    const data = (response as { data: { viewer: { canEdit: boolean } } }).data;
    expect(data.viewer.canEdit).toBe(true);
  });

  test('loader disables edits while impersonating', async () => {
    getImpersonationState.mockResolvedValue({
      isReadOnly: true,
      impersonatorUserId: 'operator-1',
    });
    const response = await loaderRequest();
    const data = (response as { data: { viewer: { canEdit: boolean } } }).data;
    expect(data.viewer.canEdit).toBe(false);
  });

  test('set-feature-flag rejects unknown organizations', async () => {
    findUnknownOrganizationIds.mockResolvedValue(['org-missing']);
    const response = await actionRequest({
      intent: 'set-feature-flag',
      key: 'teacher-lounge',
      mode: 'targeted',
      orgIds: 'org-missing',
    });
    expect((response as { data: { error: string } }).data.error).toBe('unknown_orgs');
  });

  test('set-feature-flag requires confirm when switching targeted to everyone', async () => {
    listFeatureFlags.mockResolvedValue([
      {
        key: 'teacher-lounge',
        persisted: { mode: 'targeted', orgIds: ['org-1'] },
      },
    ]);
    const response = await actionRequest({
      intent: 'set-feature-flag',
      key: 'teacher-lounge',
      mode: 'everyone',
    });
    expect((response as { data: { error: string } }).data.error).toBe('confirm_everyone');
  });

  test('add-access-list writes through domain helper', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await actionRequest({
      intent: 'add-access-list',
      email: 'teacher@school.org',
    });
    expect(addAccessListEntry).toHaveBeenCalled();
  });
});
