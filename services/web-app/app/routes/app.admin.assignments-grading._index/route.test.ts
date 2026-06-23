import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();

const prisma = {
  assignmentType: { findMany: mock(), count: mock(), create: mock() },
};

mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

const mockRequest = new Request('http://localhost/app/admin/assignments-grading');

const mockAssignmentType = {
  id: 'at-1',
  title: 'AP History Essay',
  description: 'An essay type',
  createdAt: new Date('2024-01-01'),
  image: null,
  assignmentModules: [{ id: 'm-1' }, { id: 'm-2' }],
  organizationAssignments: [{ organizationId: 'org-1' }],
  gradingAssistantLinks: [
    {
      gradingAssistantTemplate: { id: 'ga-1', name: 'AP History Grader', status: 'active' },
    },
  ],
};

describe('AssignmentsGrading loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.assignmentType.findMany.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('returns assignment types with grading assistant info', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentTypes).toHaveLength(1);
    expect(data.assignmentTypes[0].title).toBe('AP History Essay');
    expect(data.assignmentTypes[0].gradingAssistantLinks[0].gradingAssistantTemplate.status).toBe('active');
  });

  test('returns empty list when no assignment types exist', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentTypes).toHaveLength(0);
  });
});
