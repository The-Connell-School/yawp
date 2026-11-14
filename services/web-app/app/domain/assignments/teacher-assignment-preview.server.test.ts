import { beforeEach, describe, expect, mock, test } from 'bun:test';

const prisma = {
  assignmentType: { findFirst: mock() },
  assignmentModule: { findMany: mock() },
  assignment: { findUnique: mock() },
  classAssignment: { findUnique: mock() },
  document: { findFirst: mock(), create: mock() },
};

mock.module('~/utils/db.server', () => ({ prisma }));

const { createTeacherAssignmentTestDocument } = await import(
  './teacher-assignment-preview.server'
);
const { DocumentCreationError } = await import('../documents.server');

describe('createTeacherAssignmentTestDocument', () => {
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
    prisma.document.create.mockReset().mockResolvedValue({ id: 'test-1' });
  });

  test('always creates a new teacher test document', async () => {
    const first = await createTeacherAssignmentTestDocument({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      assignmentId: 'a-1',
      teacherPreviewClassAssignmentId: 'ca-1',
    });

    prisma.document.create.mockResolvedValueOnce({ id: 'test-2' });

    const second = await createTeacherAssignmentTestDocument({
      membershipId: 'teacher-1',
      assignmentTypeId: 'at-1',
      assignmentId: 'a-1',
      teacherPreviewClassAssignmentId: 'ca-1',
    });

    expect(first.documentId).toBe('test-1');
    expect(second.documentId).toBe('test-2');
    expect(prisma.document.create).toHaveBeenCalledTimes(2);
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  test('creates a test document without classAssignmentId', async () => {
    await createTeacherAssignmentTestDocument({
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
      createTeacherAssignmentTestDocument({
        membershipId: 'teacher-1',
        assignmentTypeId: 'at-1',
        assignmentId: 'a-1',
        teacherPreviewClassAssignmentId: 'ca-1',
      })
    ).rejects.toBeInstanceOf(DocumentCreationError);
  });
});
