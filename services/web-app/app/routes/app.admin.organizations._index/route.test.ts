import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import { createElement } from 'react';
import {
  ORGANIZATIONS_READ_MOVED_MESSAGE,
  OrganizationsLegacyNotice,
} from './legacy-notice';



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
const getConfiguredPreviewOrganizationAccessCode = mock();
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
  getConfiguredPreviewOrganizationAccessCode,
  getPreviewMasterAccessCode,
  isIsolatedPreviewSeatMode,
}));

const { organizationsAction: action, organizationsLoader: loader } = await import('./route.server');

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
    getConfiguredPreviewOrganizationAccessCode.mockReset();
    getOrganizationTableCookie.mockReset();

    requireAdmin.mockResolvedValue({ id: 'admin-1' });
    requireUserId.mockResolvedValue('admin-1');
    prisma.organization.create.mockResolvedValue({ id: 'org-1' });
    isIsolatedPreviewSeatMode.mockReturnValue(false);
    getPreviewMasterAccessCode.mockReturnValue('brave-otter-4193');
    getConfiguredPreviewOrganizationAccessCode.mockImplementation(
      (organizationId: string) =>
        organizationId === 'local-dev-org' ? 'brave-otter-4193' : null
    );
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

  test('denies loader access before any database read', async () => {
    const denial = new Response('Forbidden', { status: 403 });
    requireAdmin.mockRejectedValueOnce(denial);
    await expect(loader({ request: new Request('https://example.test/app/admin/organizations') } as any)).rejects.toBe(denial);
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
    expect(prisma.organization.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(isIsolatedPreviewSeatMode).not.toHaveBeenCalled();
  });

  test('denies every action before database writes or preview-seat creation', async () => {
    for (const intent of ['create', 'createPreviewSeat', 'updateFilters']) {
      const denial = new Response('Forbidden', { status: 403 });
      requireAdmin.mockRejectedValueOnce(denial);
      await expect(action({ request: createRequest(new URLSearchParams({ intent })) } as any)).rejects.toBe(denial);
    }
    expect(prisma.organization.create).not.toHaveBeenCalled();
    expect(createRuntimePreviewSeat).not.toHaveBeenCalled();
    expect(getOrganizationTableCookie).not.toHaveBeenCalled();
    expect(isIsolatedPreviewSeatMode).not.toHaveBeenCalled();
  });

  test('loader returns only preview-seat codes in preview-seat mode', async () => {
    isIsolatedPreviewSeatMode.mockReturnValue(true);
    const seats = [{ id: 'seat-2', name: 'Local Preview Seat 2', previewSeatCode: 'local-code-8127' }];
    prisma.organization.findMany.mockResolvedValue(seats);
    const request = new Request('https://example.test/app/admin/organizations');
    const response = await loader({ request } as any);
    expect(requireAdmin).toHaveBeenCalledWith(request);
    expect(response.data).toEqual({ previewSeatMode: true, previewSeats: seats, readSurfaceMoved: true });
    expect(prisma.organization.findMany).toHaveBeenCalledWith({
      where: { previewSeatCode: { not: null } },
      select: { id: true, name: true, previewSeatCode: true },
      orderBy: { createdAt: 'desc' },
    });
    expect(prisma.organization.count).not.toHaveBeenCalled();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  test('loader returns no preview codes and does not read organizations in production mode', async () => {
    prisma.organization.findMany.mockResolvedValue([{ id: 'seat-2', previewSeatCode: 'local-code-8127' }]);
    const request = new Request('https://example.test/app/admin/organizations');
    const response = await loader({ request } as any);
    expect(requireAdmin).toHaveBeenCalledWith(request);
    expect(response.data).toEqual({ previewSeatMode: false, previewSeats: [], readSurfaceMoved: true });
    expect(prisma.organization.findMany).not.toHaveBeenCalled();
    expect(getPreviewMasterAccessCode).not.toHaveBeenCalled();
    expect(getConfiguredPreviewOrganizationAccessCode).not.toHaveBeenCalled();
  });
});

function textContent(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!node) return '';
  if (Array.isArray(node)) return node.map(textContent).join('');
  if (typeof node === 'object' && 'props' in node) {
    return textContent((node as { props?: { children?: unknown } }).props?.children);
  }
  return '';
}

describe('legacy admin organizations route', () => {
  test('displays moved read state while preserving platform-only write controls', () => {
    const content = textContent(
      OrganizationsLegacyNotice({
        previewSeatMode: true,
        createPreviewSeatControl: createElement(
          'button',
          null,
          'Create Preview Seat'
        ),
        createOrganizationControl: createElement(
          'button',
          null,
          'Create Organization'
        ),
      })
    );

    expect(content).toContain(ORGANIZATIONS_READ_MOVED_MESSAGE);
    expect(content).toContain('Use Yawp Internal');
    expect(content).toContain('Platform-only writes');
    expect(content).toContain('Create Preview Seat');
    expect(content).toContain('Create Organization');
    expect(content).not.toContain('Total Organizations');
    expect(content).not.toContain('Organization Growth');
  });
});
