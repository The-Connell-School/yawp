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
  organizationAssignments: [{ id: 'oa-1' }],
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

describe('PipelinesRoute loader', () => {
  beforeEach(() => {
    requireAdmin.mockReset();
    prisma.assignmentType.findMany.mockReset();
    prisma.gradingAssistantTemplate.findMany.mockReset();
    requireAdmin.mockResolvedValue(undefined);
  });

  test('returns assignment types with grading assistant info', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([
      { id: 'ga-1', name: 'AP History Grader', status: 'active', assignmentTypeLinks: [{ id: 'l-1' }] },
    ]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.assignmentTypes).toHaveLength(1);
    expect(data.assignmentTypes[0].title).toBe('AP History Essay');
    expect(data.assignmentTypes[0].moduleCount).toBe(2);
    expect(data.assignmentTypes[0].orgCount).toBe(1);
    expect(data.assignmentTypes[0].gradingAssistant?.name).toBe('AP History Grader');
    expect(data.assignmentTypes[0].gradingAssistant?.status).toBe('active');
  });

  test('separates unlinked grading assistants', async () => {
    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([
      { id: 'ga-1', name: 'AP History Grader', status: 'active', assignmentTypeLinks: [] },
      { id: 'ga-2', name: 'Standalone Template', status: 'draft', assignmentTypeLinks: [] },
    ]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    // ga-1 is in assignmentType.gradingAssistantLinks so it's considered linked
    // ga-2 is truly unlinked
    expect(data.unlinkedTemplates).toHaveLength(1);
    expect(data.unlinkedTemplates[0].name).toBe('Standalone Template');
  });

  test('computes gap count for types without active grading', async () => {
    const typeWithoutGrading = {
      ...mockAssignmentType,
      id: 'at-2',
      title: 'No Grading Type',
      gradingAssistantLinks: [],
    };

    prisma.assignmentType.findMany.mockResolvedValue([mockAssignmentType, typeWithoutGrading]);
    prisma.gradingAssistantTemplate.findMany.mockResolvedValue([]);

    const response = await loader({ request: mockRequest, params: {}, context: {} } as any);
    const data = (response as { data: any }).data;

    expect(data.stats.typeCount).toBe(2);
    expect(data.stats.gapCount).toBe(1);
  });
});
