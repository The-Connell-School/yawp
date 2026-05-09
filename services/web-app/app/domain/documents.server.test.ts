import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentModule: {
    findMany: mock(),
  },
  assignment: {
    findUnique: mock(),
  },
  studentProfile: {
    findUnique: mock(),
    create: mock(),
  },
  document: {
    create: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { createDocumentForAssignmentType } = await import('./documents.server');

describe('createDocumentForAssignmentType', () => {
  beforeEach(() => {
    prisma.assignmentModule.findMany.mockReset();
    prisma.assignment.findUnique.mockReset();
    prisma.studentProfile.findUnique.mockReset();
    prisma.studentProfile.create.mockReset();
    prisma.document.create.mockReset();

    prisma.assignment.findUnique.mockResolvedValue({
      assignmentTypeId: 'assignment-type-1',
    });
    prisma.studentProfile.findUnique.mockResolvedValue({
      id: 'student-profile-1',
      classes: [],
    });
    prisma.document.create.mockResolvedValue({ id: 'document-1' });
  });

  test('creates one module session for every active assignment module', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      {
        id: 'module-1',
        instructions: [{ id: 'instruction-1', prompt: 'Prompt 1' }],
      },
      {
        id: 'module-2',
        instructions: [{ id: 'instruction-2', prompt: 'Prompt 2' }],
      },
    ]);

    await createDocumentForAssignmentType({
      profileId: 'profile-1',
      assignmentTypeId: 'assignment-type-1',
      assignmentId: 'assignment-1',
    });

    expect(prisma.assignmentModule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignmentTypeId: 'assignment-type-1', deletedAt: null },
        orderBy: { position: 'asc' },
      })
    );
    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignmentModuleSessions: {
            create: [
              expect.objectContaining({ assignmentModuleId: 'module-1' }),
              expect.objectContaining({ assignmentModuleId: 'module-2' }),
            ],
          },
        }),
      })
    );
  });
});
