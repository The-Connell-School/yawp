import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
  },
  document: {
    findMany: mock(),
  },
  class: {
    findMany: mock(),
  },
};

const requireUserId = mock();
const requireProfile = mock();
const createDocumentForAssignmentType = mock();
const redirectWithToast = mock();

mock.module('~/utils/db.server', () => ({ prisma }));
mock.module('~/utils/auth.server', () => ({
  requireUserId,
  requireProfile,
}));
mock.module('~/domain/documents.server', () => ({
  createDocumentForAssignmentType,
  DocumentCreationError: class DocumentCreationError extends Error {},
}));
mock.module('~/utils/toast.server', () => ({
  redirectWithToast,
}));

const { action } = await import('./route');

describe('app.assignment-types.$id action', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    requireUserId.mockReset();
    requireProfile.mockReset();
    createDocumentForAssignmentType.mockReset();
    redirectWithToast.mockReset();

    requireUserId.mockResolvedValue('user-1');
    requireProfile.mockResolvedValue({
      id: 'profile-1',
      organization: { id: 'org-1' },
    });
    prisma.assignmentType.findFirst.mockResolvedValue({ id: 'at-1' });
    createDocumentForAssignmentType.mockResolvedValue({ documentId: 'doc-1' });
    redirectWithToast.mockImplementation((url, toast) => ({
      redirectedTo: url,
      toast,
    }));
  });

  test('requires assignment type availability before creating a document', async () => {
    await action({
      request: new Request('https://example.test/app/assignment-types/at-1', {
        method: 'POST',
      }),
      params: { id: 'at-1' },
    } as never);

    expect(prisma.assignmentType.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'at-1',
        organizationAssignments: {
          some: { organizationId: 'org-1' },
        },
      },
      select: { id: true },
    });
    expect(createDocumentForAssignmentType).toHaveBeenCalledWith({
      profileId: 'profile-1',
      assignmentTypeId: 'at-1',
    });
  });

  test('rejects direct document creation for unavailable assignment types', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    const response = await action({
      request: new Request('https://example.test/app/assignment-types/at-2', {
        method: 'POST',
      }),
      params: { id: 'at-2' },
    } as never);

    expect(response as unknown).toEqual({
      redirectedTo: '/app',
      toast: {
        type: 'error',
        description: 'Assignment type not found',
      },
    });
    expect(createDocumentForAssignmentType).not.toHaveBeenCalled();
  });
});
