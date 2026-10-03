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
    findFirst: mock(),
    create: mock(),
    update: mock(),
  },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { createDocumentForAssignmentType, ensureAssignmentModuleSessionsForDocument } =
  await import('./documents.server');

describe('createDocumentForAssignmentType', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset();
    prisma.assignmentModule.findMany.mockReset();
    prisma.assignment.findUnique.mockReset();
    prisma.classAssignment.findUnique.mockReset();
    prisma.document.findFirst.mockReset();
    prisma.document.create.mockReset();
    prisma.document.update.mockReset();

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
    prisma.document.findFirst.mockResolvedValue(null);
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

  test('reuses existing document when classAssignmentId already has a document', async () => {
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
    prisma.document.findFirst.mockResolvedValue({ id: 'existing-doc-1' });

    const created = await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      assignmentId: 'assignment-1',
      classAssignmentId: 'class-assignment-1',
    });

    expect(created.documentId).toBe('existing-doc-1');
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  test('falls back to assignmentId reuse when no classAssignmentId match exists', async () => {
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
    // First search by classAssignmentId returns null; second by assignmentId returns a match.
    prisma.document.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'existing-by-assignment' });

    const created = await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      assignmentId: 'assignment-1',
      classAssignmentId: 'class-assignment-1',
    });

    expect(created.documentId).toBe('existing-by-assignment');
    expect(prisma.document.create).not.toHaveBeenCalled();
  });

  test('creates one module session for every active assignment module', async () => {
    prisma.document.findFirst.mockResolvedValue(null);
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

  test('records the paragraph type on a standalone document', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      { id: 'module-1', instructions: [] },
    ]);

    await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      paragraphMode: 'argue',
    });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paragraphMode: 'argue' }),
      })
    );
  });

  /** So a teacher's test documents say which type each one practices. */
  test('titles a typed document after its paragraph type', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      { id: 'module-1', instructions: [] },
    ]);

    await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
      paragraphMode: 'argue',
    });

    expect(prisma.document.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: 'Argue a position' }),
      })
    );
  });

  test('writes no paragraph type when none is given', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      { id: 'module-1', instructions: [] },
    ]);

    await createDocumentForAssignmentType({
      membershipId: 'membership-1',
      assignmentTypeId: 'assignment-type-1',
    });

    const data = (prisma.document.create.mock.calls[0]?.[0] as any).data;
    expect('paragraphMode' in data).toBe(false);
    expect(data.title).toBe('');
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

describe('ensureAssignmentModuleSessionsForDocument', () => {
  beforeEach(() => {
    prisma.assignmentModule.findMany.mockReset();
    prisma.document.update.mockReset();
  });

  test('creates sessions only for modules missing a session, and returns true', async () => {
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

    const created = await ensureAssignmentModuleSessionsForDocument(
      'document-1',
      'assignment-type-1',
      ['module-1']
    );

    expect(created).toBe(true);
    expect(prisma.assignmentModule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { assignmentTypeId: 'assignment-type-1', deletedAt: null },
        orderBy: { position: 'asc' },
      })
    );
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: {
        assignmentModuleSessions: {
          create: [expect.objectContaining({ assignmentModuleId: 'module-2' })],
        },
      },
    });
  });

  test('does nothing and returns false when every module already has a session', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      {
        id: 'module-1',
        instructions: [{ id: 'instruction-1', prompt: 'Prompt 1' }],
      },
    ]);

    const created = await ensureAssignmentModuleSessionsForDocument(
      'document-1',
      'assignment-type-1',
      ['module-1']
    );

    expect(created).toBe(false);
    expect(prisma.document.update).not.toHaveBeenCalled();
  });

  test('backfills every module when a document has no sessions at all', async () => {
    prisma.assignmentModule.findMany.mockResolvedValue([
      {
        id: 'module-1',
        instructions: [{ id: 'instruction-1', prompt: 'Prompt 1' }],
      },
      {
        id: 'module-2',
        instructions: [],
      },
    ]);

    const created = await ensureAssignmentModuleSessionsForDocument(
      'document-1',
      'assignment-type-1',
      []
    );

    expect(created).toBe(true);
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'document-1' },
      data: {
        assignmentModuleSessions: {
          create: [
            expect.objectContaining({ assignmentModuleId: 'module-1' }),
            expect.objectContaining({
              assignmentModuleId: 'module-2',
            }),
          ],
        },
      },
    });
  });
});
