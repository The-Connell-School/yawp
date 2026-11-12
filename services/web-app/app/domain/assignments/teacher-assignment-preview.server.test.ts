import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: { findFirst: mock() },
  assignmentModule: { findMany: mock() },
  assignment: { findUnique: mock() },
  classAssignment: { findUnique: mock() },
  document: { findFirst: mock(), create: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { createOrReuseTeacherAssignmentPreviewDocument } = await import(
  './teacher-assignment-preview.server'
);
const { DocumentCreationError } = await import('../documents.server');

describe('createOrReuseTeacherAssignmentPreviewDocument', () => {
  beforeEach(() => {
    prisma.assignmentType.findFirst.mockReset().mockResolvedValue({
      id: 'at-1',
    });
    prisma.classAssignment.findUnique.mockReset().mockResolvedValue({
      assignmentId: 'a-1',
      assignment: { assignmentTypeId: 'at-1' },
    });
    prisma.assignment.findUnique.mockReset().mockResolvedValue({
      assignmentTypeId: 'at-1',
    });
    prisma.assignmentModule.findMany.mockReset().mockResolvedValue([
      {
        id: 'module-1',
        instructions: [{ id: 'i-1', prompt: 'Hi' }],
      },
    ]);
    prisma.document.findFirst.mockReset().mockResolvedValue(null);
    prisma.document.create.mockReset().mockResolvedValue({ id: 'preview-1' });
  });

  test('reuses an existing teacher preview for the same class deployment', async () => {
    prisma.document.findFirst.mockResolvedValue({ id: 'existing-preview' });

    const result = await createOrReuseTeacherAssignmentPreviewDocument({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      assignmentId: 'a-1',
      teacherPreviewClassAssignmentId: 'ca-1',
    });

    expect(result.documentId).toBe('existing-preview');
    expect(prisma.document.create).not.toHaveBeenCalled();
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          membershipId: 'teacher-1',
          artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
          teacherPreviewClassAssignmentId: 'ca-1',
        }),
      })
    );
  });

  test('creates a preview without classAssignmentId', async () => {
    await createOrReuseTeacherAssignmentPreviewDocument({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      assignmentId: 'a-1',
      teacherPreviewClassAssignmentId: 'ca-1',
    });

    const createData = prisma.document.create.mock.calls[0][0].data;
    expect(createData.artifactKind).toBe('TEACHER_ASSIGNMENT_PREVIEW');
    expect(createData.teacherPreviewClassAssignmentId).toBe('ca-1');
    expect(createData.assignmentId).toBe('a-1');
    expect(createData.classAssignmentId).toBeUndefined();
  });

  test('rejects mismatched class deployment', async () => {
    prisma.classAssignment.findUnique.mockResolvedValue({
      assignmentId: 'other',
      assignment: { assignmentTypeId: 'at-1' },
    });

    await expect(
      createOrReuseTeacherAssignmentPreviewDocument({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        assignmentId: 'a-1',
        teacherPreviewClassAssignmentId: 'ca-1',
      })
    ).rejects.toBeInstanceOf(DocumentCreationError);
  });
});
