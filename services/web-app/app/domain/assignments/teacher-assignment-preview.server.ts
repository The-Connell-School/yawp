import { prisma } from '~/utils/db.server';
import {
  buildAssignmentModuleSessionCreateData,
  DocumentCreationError,
} from '../documents.server';

export { buildTeacherAssignmentPreviewDocumentsWhere } from './teacher-assignment-preview-where';

type CreateTeacherPreviewInput = {
  membershipId: string;
  assignmentTypeId: string;
  assignmentId: string;
  teacherPreviewClassAssignmentId: string;
};

export async function findTeacherAssignmentPreviewDocumentId({
  teacherMembershipId,
  classAssignmentId,
}: {
  teacherMembershipId: string;
  classAssignmentId: string;
}): Promise<string | null> {
  const row = await prisma.document.findFirst({
    where: {
      membershipId: teacherMembershipId,
      artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
      teacherPreviewClassAssignmentId: classAssignmentId,
      deletedAt: null,
      archivedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function createTeacherAssignmentTestDocument(
  input: CreateTeacherPreviewInput
): Promise<{ documentId: string }> {
  const assignmentType = await prisma.assignmentType.findFirst({
    where: { id: input.assignmentTypeId, archivedAt: null },
    select: { id: true },
  });
  if (!assignmentType) {
    throw new DocumentCreationError('AssignmentType is not available.');
  }

  const classAssignment = await prisma.classAssignment.findUnique({
    where: { id: input.teacherPreviewClassAssignmentId },
    select: {
      assignmentId: true,
      assignment: { select: { assignmentTypeId: true } },
    },
  });
  if (!classAssignment) {
    throw new DocumentCreationError(
      `ClassAssignment ${input.teacherPreviewClassAssignmentId} not found`
    );
  }
  if (classAssignment.assignment.assignmentTypeId !== input.assignmentTypeId) {
    throw new DocumentCreationError(
      'ClassAssignment assignment type does not match input.assignmentTypeId'
    );
  }
  if (input.assignmentId !== classAssignment.assignmentId) {
    throw new DocumentCreationError(
      'assignmentId does not match ClassAssignment.assignmentId'
    );
  }

  const assignmentModules = await prisma.assignmentModule.findMany({
    where: { assignmentTypeId: input.assignmentTypeId, deletedAt: null },
    orderBy: { position: 'asc' },
    include: {
      instructions: {
        orderBy: { position: 'asc' },
        include: { buttons: { orderBy: { position: 'asc' } } },
      },
    },
  });
  if (assignmentModules.length === 0) {
    throw new DocumentCreationError('No modules for this AssignmentType.');
  }

  const document = await prisma.document.create({
    data: {
      membershipId: input.membershipId,
      text: '',
      html: '',
      title: '',
      artifactKind: 'TEACHER_ASSIGNMENT_PREVIEW',
      assignmentTypeId: input.assignmentTypeId,
      assignmentId: input.assignmentId,
      teacherPreviewClassAssignmentId: input.teacherPreviewClassAssignmentId,
      assignmentModuleSessions: {
        create: buildAssignmentModuleSessionCreateData(assignmentModules),
      },
    },
    select: { id: true },
  });

  return { documentId: document.id };
}

/** @deprecated Each Try it opens a new test document; use createTeacherAssignmentTestDocument. */
export async function createOrReuseTeacherAssignmentPreviewDocument(
  input: CreateTeacherPreviewInput
): Promise<{ documentId: string }> {
  return createTeacherAssignmentTestDocument(input);
}
