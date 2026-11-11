import { findStudentGroupDocument } from '~/domain/collaboration/groups.server';
import {
  createDocumentForAssignmentType,
  DocumentCreationError,
  documentCreationErrorTextForClient,
} from '~/domain/documents.server';
import { recordClassAssignmentFirstOpen } from '~/domain/student-class-assignment-first-open.server';
import { prisma } from '~/utils/db.server';

export type OpenClassAssignmentResult =
  | { ok: true; url: string }
  | {
      ok: false;
      reason: 'groups-not-open' | 'creation-failed';
      message: string;
    };

export async function openClassAssignmentForStudent({
  classAssignmentId,
  membershipId,
}: {
  classAssignmentId: string;
  membershipId: string;
}): Promise<OpenClassAssignmentResult> {
  const classAssignment = await prisma.classAssignment.findUnique({
    where: { id: classAssignmentId },
    select: {
      id: true,
      assignmentId: true,
      assignment: {
        select: {
          assignmentTypeId: true,
          collaborationEnabled: true,
        },
      },
    },
  });

  if (!classAssignment) {
    return {
      ok: false,
      reason: 'creation-failed',
      message: 'Assignment not found.',
    };
  }

  if (classAssignment.assignment.collaborationEnabled) {
    const groupDocument = await findStudentGroupDocument({
      classAssignmentId: classAssignment.id,
      membershipId,
    });

    if (!groupDocument) {
      return {
        ok: false,
        reason: 'groups-not-open',
        message:
          'Your teacher has not opened groups for this assignment yet.',
      };
    }

    await recordClassAssignmentFirstOpen({
      classAssignmentId: classAssignment.id,
      membershipId,
    });

    const collabParams = new URLSearchParams({
      exitTo: '/app?tab=assignments',
    });

    return {
      ok: true,
      url: `/app/collab-documents/${groupDocument.documentId}?${collabParams}`,
    };
  }

  let documentId = '';
  try {
    const created = await createDocumentForAssignmentType({
      membershipId,
      assignmentTypeId: classAssignment.assignment.assignmentTypeId,
      assignmentId: classAssignment.assignmentId,
      classAssignmentId: classAssignment.id,
    });
    documentId = created.documentId;
  } catch (creationError) {
    if (creationError instanceof DocumentCreationError) {
      return {
        ok: false,
        reason: 'creation-failed',
        message: documentCreationErrorTextForClient(
          creationError,
          'Could not start this assignment.',
        ),
      };
    }
    throw creationError;
  }

  await recordClassAssignmentFirstOpen({
    classAssignmentId: classAssignment.id,
    membershipId,
  });

  const redirectParams = new URLSearchParams({
    spa: '1',
    exitTo: '/app?tab=assignments',
  });

  return {
    ok: true,
    url: `/app/documents/${documentId}?${redirectParams}`,
  };
}

/** View-only open: never creates a document; returns an existing student doc if any. */
export async function openExistingClassAssignmentForStudent({
  classAssignmentId,
  membershipId,
}: {
  classAssignmentId: string;
  membershipId: string;
}): Promise<OpenClassAssignmentResult> {
  const classAssignment = await prisma.classAssignment.findUnique({
    where: { id: classAssignmentId },
    select: {
      id: true,
      assignmentId: true,
      assignment: {
        select: {
          collaborationEnabled: true,
        },
      },
    },
  });

  if (!classAssignment) {
    return {
      ok: false,
      reason: 'creation-failed',
      message: 'Assignment not found.',
    };
  }

  if (classAssignment.assignment.collaborationEnabled) {
    const groupDocument = await findStudentGroupDocument({
      classAssignmentId: classAssignment.id,
      membershipId,
    });

    if (!groupDocument) {
      return {
        ok: false,
        reason: 'groups-not-open',
        message:
          'Your teacher has not opened groups for this assignment yet.',
      };
    }

    const collabParams = new URLSearchParams({
      exitTo: '/app?tab=assignments',
    });

    return {
      ok: true,
      url: `/app/collab-documents/${groupDocument.documentId}?${collabParams}`,
    };
  }

  const existing = await prisma.document.findFirst({
    where: {
      membershipId,
      classAssignmentId: classAssignment.id,
      deletedAt: null,
      archivedAt: null,
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!existing) {
    return {
      ok: false,
      reason: 'creation-failed',
      message: 'Assignment not available.',
    };
  }

  const redirectParams = new URLSearchParams({
    spa: '1',
    exitTo: '/app?tab=assignments',
  });

  return {
    ok: true,
    url: `/app/documents/${existing.id}?${redirectParams}`,
  };
}
