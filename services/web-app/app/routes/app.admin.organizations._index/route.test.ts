import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  organization: {
    create: mock(),
    findMany: mock(),
    count: mock(),
    groupBy: mock(),
  },
  $queryRaw: mock(),
};

const requireAdmin = mock();
const requireUserId = mock();
const createRuntimePreviewSeat = mock();
const isIsolatedPreviewSeatMode = mock();
const getPreviewMasterAccessCode = mock();
const getOrganizationTableCookie = mock();
const getOrganizationTableCookieValue = mock();
const setOrganizationTableCookie = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  getSessionExpirationDate: () => new Date('2030-01-01T00:00:00.000Z'),
  requireAdmin,
  requireUserId,
  sessionKey: 'sessionId',
}));
mock.module('~/utils/cookies.server', () => ({
  getOrganizationTableCookie,
  getOrganizationTableCookieValue,
  OrganizationTableCookie: {},
  setOrganizationTableCookie,
}));
mock.module('./preview-seat.server', () => ({
  createRuntimePreviewSeat,
  getPreviewMasterAccessCode,
  isIsolatedPreviewSeatMode,
}));

const { action, loader } = await import('./route');

afterAll(() => {
  mock.restore();
});

function createRequest(form: URLSearchParams) {
  return new Request('https://example.test/app/admin/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form,
  });
}

describe('admin organizations index route', () => {
  beforeEach(() => {
    prisma.organization.create.mockReset();
    prisma.organization.findMany.mockReset();
    prisma.organization.count.mockReset();
    prisma.organization.groupBy.mockReset();
    prisma.$queryRaw.mockReset();
    requireAdmin.mockReset();
    requireUserId.mockReset();
    createRuntimePreviewSeat.mockReset();
    isIsolatedPreviewSeatMode.mockReset();
    getPreviewMasterAccessCode.mockReset();
    getOrganizationTableCookie.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireUserId.mockResolvedValue('admin-1');
    prisma.organization.create.mockResolvedValue({ id: 'org-1' });
    isIsolatedPreviewSeatMode.mockReturnValue(false);
    getPreviewMasterAccessCode.mockReturnValue('brave-otter-4193');
    createRuntimePreviewSeat.mockResolvedValue({
      organizationId: 'preview-seat-2',
      label: 'Seat 2',
      organizationName: 'Yawp Preview - Seat 2',
      previewSeatCode: 'calm-panda-8127',
    });
    getOrganizationTableCookie.mockResolvedValue({
      sort: 'createdAt',
      direction: 'desc',
      skip: 0,
      take: 25,
    });
    prisma.organization.findMany.mockResolvedValue([]);
    prisma.organization.count.mockResolvedValue(0);
    prisma.organization.groupBy.mockResolvedValue([]);
    prisma.$queryRaw.mockResolvedValue([
      {
        total_organizations: 0,
        active_organizations: 0,
        total_students: 0,
        total_teachers: 0,
      },
    ]);
  });

  test('creates organizations without default writing practice configuration', async () => {
    const form = new URLSearchParams();
    form.set('intent', 'create');
    form.set('name', 'New Org');
    form.set('numOfStudentSeats', '30');
    form.set('numOfTeacherSeats', '10');

    await action({
      request: createRequest(form),
      params: {},
      context: {} as never,
    } as any);

    expect(prisma.organization.create).toHaveBeenCalledWith({
      data: {
        name: 'New Org',
        numOfStudentSeats: 30,
        numOfTeacherSeats: 10,
        accessExpiresAt: null,
      },
    });
  });

  test('creates and returns a seeded preview seat only in isolated preview mode', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    const form = new URLSearchParams({ intent: 'createPreviewSeat' });

    const response = await action({
      request: createRequest(form),
      params: {},
      context: {} as never,
    } as any);

    expect(createRuntimePreviewSeat).toHaveBeenCalledWith(prisma, {
      reservedCodes: ['brave-otter-4193'],
    });
    expect((response as { data: Record<string, unknown> }).data).toEqual({
      success: true,
      previewSeat: {
        organizationId: 'preview-seat-2',
        label: 'Seat 2',
        organizationName: 'Yawp Preview - Seat 2',
        previewSeatCode: 'calm-panda-8127',
      },
    });
  });

  test('rejects forged preview-seat creation in production mode', async () => {
    const form = new URLSearchParams({ intent: 'createPreviewSeat' });

    const response = await action({
      request: createRequest(form),
      params: {},
      context: {} as never,
    } as any);

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(404);
    expect(createRuntimePreviewSeat).not.toHaveBeenCalled();
  });

  test('loader exposes retrievable master and runtime codes only in preview mode', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    prisma.organization.findMany.mockResolvedValue([
      {
        id: 'local-dev-org',
        name: 'Yawp Local Dev',
        previewSeatCode: null,
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
        memberships: [],
      },
      {
        id: 'preview-seat-2',
        name: 'Yawp Preview - Seat 2',
        previewSeatCode: 'calm-panda-8127',
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
        memberships: [],
      },
      {
        id: 'ordinary-org',
        name: 'Ordinary Org',
        previewSeatCode: null,
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
        memberships: [],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/admin/organizations'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.previewSeatMode).toBe(true);
    expect(
      response.data.organizations.map(
        (organization) => organization.previewAccessCode
      )
    ).toEqual(['brave-otter-4193', 'calm-panda-8127', null]);
    expect(response.data.organizations[1]).not.toHaveProperty(
      'previewSeatCode'
    );
  });

  test('loader removes preview-seat mode and codes from production data', async () => {
    prisma.organization.findMany.mockResolvedValue([
      {
        id: 'preview-seat-2',
        name: 'Yawp Preview - Seat 2',
        previewSeatCode: 'calm-panda-8127',
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
        memberships: [],
      },
    ]);

    const response = await loader({
      request: new Request('https://example.test/app/admin/organizations'),
      params: {},
      context: {} as never,
    } as any);

    expect(response.data.previewSeatMode).toBe(false);
    expect(response.data.organizations[0].previewAccessCode).toBeNull();
    expect(response.data.organizations[0]).not.toHaveProperty(
      'previewSeatCode'
    );
    expect(getPreviewMasterAccessCode).not.toHaveBeenCalled();
  });
});
