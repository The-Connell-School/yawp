import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: {
    findFirst: mock(),
  },
  assignmentModule: {
    findMany: mock(),
  },
  assignment: {
    findUnique: mock(),
  },
  classAssignment: {
    findUnique: mock(),
  },
  document: {
    create: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { createDocumentForAssignmentType } = await import('./documents.server');

describe('createDocumentForAssignmentType', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentModule.findMany.mockReset();
    prisma.assignment.findUnique.mockReset();
    prisma.classAssignment.findUnique.mockReset();
    prisma.document.create.mockReset();

    prisma.assignmentType.findFirst.mockResolvedValue({
      id: 'assignment-type-1',
    });
    prisma.assignment.findUnique.mockResolvedValue({
      assignmentTypeId: 'assignment-type-1',
    });
    prisma.document.create.mockResolvedValue({ id: 'document-1' });
  });

  test('links classAssignmentId when starting from a deployed assignment', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      assignmentId: 'assignment-1',
      assignment: { assignmentTypeId: 'assignment-type-1' },
    });
    prisma.assignmentModule.findMany.mockResolvedValue([
      {
        id: 'module-1',
        instructions: [{ id: 'instruction-1', prompt: 'Prompt 1' }],
      },
    ]);

    await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      assignmentId: 'assignment-1',
      classAssignmentId: 'class-assignment-1',
    });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignmentId: 'assignment-1',
          classAssignmentId: 'class-assignment-1',
        }),
      })
    );
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
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      assignmentId: 'assignment-1',
    });

    expect(prisma.assignmentType.findFirst).toHaveBeenCalledWith({
      where: { id: 'assignment-type-1', archivedAt: null },
      select: { id: true },
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

  test('can seed a document with initial title and content', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      {
        id: 'module-1',
        instructions: [{ id: 'instruction-1', prompt: 'Prompt 1' }],
      },
    ]);

    await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      initialTitle: 'Thesis Essay',
      initialText: 'This draft has a specific claim.',
      initialHtml: '<p>This draft has a specific claim.</p>',
    });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Thesis Essay',
          text: 'This draft has a specific claim.',
          html: '<p>This draft has a specific claim.</p>',
        }),
      })
    );
  });

  test('does not create a document for an archived assignment type', async () => {
    prisma.assignmentType.findFirst.mockResolvedValue(null);

    await expect(
      createDocumentForAssignmentType({
        membershipId: 'membership-1',
        assignmentTypeId: 'assignment-type-1',
      })
    ).rejects.toThrow('AssignmentType is not available.');

    expect(prisma.assignmentModule.findMany).not.toHaveBeenCalled();
    expect(prisma.document.create).not.toHaveBeenCalled();
  });
});
