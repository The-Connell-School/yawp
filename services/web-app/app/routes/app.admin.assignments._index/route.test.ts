import { beforeEach, describe, expect, mock, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const requireAdmin = mock();
const isPlatformLegacyAssignmentAdminEnabled = mock(async () => true);
let currentLoaderData: unknown = {
  legacyAssignmentAdminEnabled: true,
  assignmentTypes: [],
};

const prisma = {
  assignmentType: { findMany: mock() },
};

mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module(
  '~/domain/assignment-types/platform-legacy-assignment-admin.server',
  () => ({ isPlatformLegacyAssignmentAdminEnabled })
);
mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('react-router', () => ({
  data: (value: unknown) => ({ data: value }),
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) =>
    React.createElement('a', { ...props, href: to }, children),
  useLoaderData: () => currentLoaderData,
  useNavigate: () => () => undefined,
}));

const { default: AssignmentTypesRoute, loader } = await import('./route');

const mockRequest = new Request('http://localhost/app/admin/assignments');

describe('admin assignments index', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    isPlatformLegacyAssignmentAdminEnabled.mockReset();
    prisma.assignmentType.findMany.mockReset();
    requireAdmin.mockResolvedValue(undefined);
    isPlatformLegacyAssignmentAdminEnabled.mockResolvedValue(true);
    currentLoaderData = { legacyAssignmentAdminEnabled: true, assignmentTypes: [] };
  });

  test('loader skips assignment types when the legacy admin flag is off', async () => {
    isPlatformLegacyAssignmentAdminEnabled.mockResolvedValue(false);

    const response = await loader({
      request: mockRequest,
      params: {},
      context: {},
    } as any);
    const data = (response as { data: any }).data;

    expect(data.legacyAssignmentAdminEnabled).toBe(false);
    expect(data.assignmentTypes).toEqual([]);
    expect(prisma.assignmentType.findMany).not.toHaveBeenCalled();
  });

  test('renders the off notice when legacy admin is disabled', () => {
    currentLoaderData = {
      legacyAssignmentAdminEnabled: false,
      assignmentTypes: [],
    };

    const html = renderToStaticMarkup(React.createElement(AssignmentTypesRoute));

    expect(html).toContain('Platform assignment-type admin is off');
    expect(html).toContain('platform_legacy_assignment_admin');
  });

  test('renders the restored intro when legacy admin is enabled', () => {
    currentLoaderData = {
      legacyAssignmentAdminEnabled: true,
      assignmentTypes: [
        {
          id: 'at-1',
          title: 'Prewriting',
          image: null,
          assignmentModules: [],
          organizationAssignments: [],
        },
      ],
    };

    const html = renderToStaticMarkup(React.createElement(AssignmentTypesRoute));

    expect(html).toContain('Platform assignment-type admin (legacy UI)');
    expect(html).toContain('href="/app/admin/assignment-types/new"');
  });
});
