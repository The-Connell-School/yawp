import { beforeEach, describe, expect, mock, test } from 'bun:test';

const requireAdmin = mock();

const prisma = {
  assignmentType: { findMany: mock() },
  gradingAssistantTemplate: { findMany: mock() },
};

mock.module('~/utils/auth.server', () => ({ requireAdmin }));
mock.module('~/utils/db.server', () => ({ prisma }));

const { loader } = await import('./route');

const mockRequest = new Request('http://localhost/app/admin/pipelines');

const mockAssignmentType = {
  id: 'at-1',
  title: 'AP History Essay',
  description: 'An essay type',
  position: 0,
  archivedAt: null,
  image: null,
  assignmentModules: [{ id: 'm-1' }, { id: 'm-2' }],
  organizationAssignments: [{ organizationId: 'org-1' }],
  gradingAssistantLinks: [
    {
      gradingAssistantTemplate: {
        id: 'ga-1',
        name: 'AP History Grader',
        status: 'active',
      },
    },
  ],
};

const mockTemplate = {
  id: 'ga-1',
  name: 'AP History Grader',
  status: 'active',
  assignmentTypeLinks: [
    {
      assignmentType: { id: 'at-1', title: 'AP History Essay' },
    },
  ],
};

describe('AssignmentsAndGrading loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.gradingAssistantTemplate.findMany.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('returns assignment types with grading assistant info', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([mockTemplate]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentTypes).toHaveLength(1);
    expect(data.assignmentTypes[0].title).toBe('AP History Essay');
    expect(data.assignmentTypes[0].moduleCount).toBe(2);
    expect(data.assignmentTypes[0].orgCount).toBe(1);
    expect(data.assignmentTypes[0].gradingAssistant?.name).toBe('AP History Grader');
  });

  test('returns all grading templates with their linked assignment types', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([
      mockTemplate,
      { id: 'ga-2', name: 'Standalone', status: 'draft', assignmentTypeLinks: [] },
    ]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.gradingTemplates).toHaveLength(2);
    expect(data.gradingTemplates[0].linkedTypes).toHaveLength(1);
    expect(data.gradingTemplates[0].linkedTypes[0].title).toBe('AP History Essay');
    expect(data.gradingTemplates[1].linkedTypes).toHaveLength(0);
  });

  test('separates archived assignment types', async () => {
    const archivedType = {
      ...mockAssignmentType,
      id: 'at-2',
      title: 'Old Essay',
      archivedAt: new Date('2024-01-01'),
      gradingAssistantLinks: [],
    };

    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType, archivedType]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentTypes).toHaveLength(2);
    const active = data.assignmentTypes.filter((at: any) => !at.archivedAt);
    const archived = data.assignmentTypes.filter((at: any) => at.archivedAt);
    expect(active).toHaveLength(1);
    expect(archived).toHaveLength(1);
    expect(archived[0].title).toBe('Old Essay');
  });
});
