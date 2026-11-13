import type { Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import { buildTeacherAssignmentPreviewDocumentsWhere } from '~/domain/assignments/teacher-assignment-preview-where';
import { studentModuleSessionSingleSelect } from './module-session-select.server';

const previewInProgressSelect = {
  id: true,
  title: true,
  updatedAt: true,
  artifactKind: true,
  assignment: {
    select: {
      id: true,
      title: true,
      submitForGrade: true,
      pointValue: true,
    },
  },
  membership: {
    select: {
      id: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  },
  group: {
    select: {
      id: true,
      label: true,
      members: {
        where: { removedAt: null },
        orderBy: { membershipId: 'asc' as const },
        select: {
          membershipId: true,
          membership: {
            select: {
              id: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
    },
  },
  assignmentModuleSessions: studentModuleSessionSingleSelect,
} satisfies Prisma.DocumentSelect;

const previewSubmissionDocumentSelect = {
  id: true,
  title: true,
  artifactKind: true,
  assignment: {
    select: {
      id: true,
      title: true,
      submitForGrade: true,
      pointValue: true,
    },
  },
  membership: {
    select: {
      id: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
  },
  group: {
    select: {
      id: true,
      label: true,
      members: {
        where: { removedAt: null },
        orderBy: { membershipId: 'asc' as const },
        select: {
          membershipId: true,
          membership: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  username: true,
                },
              },
            },
          },
        },
      },
    },
  },
  assignmentModuleSessions: studentModuleSessionSingleSelect,
} satisfies Prisma.DocumentSelect;

export async function loadTeacherPreviewDocumentsForClass({
  classId,
  teacherMembershipId,
}: {
  classId: string;
  teacherMembershipId: string;
}) {
  const teacherPreviewDocumentWhere = buildTeacherAssignmentPreviewDocumentsWhere(
    {
      classId,
      teacherMembershipId,
    }
  );

  const [inProgressDocuments, submissions] = await Promise.all([
    prisma.document.findMany({
      where: {
        ...teacherPreviewDocumentWhere,
        deletedAt: null,
        archivedAt: null,
        submissions: { none: {} },
      },
      select: previewInProgressSelect,
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.submission.findMany({
      where: {
        unsubmittedAt: null,
        document: {
          is: {
            ...teacherPreviewDocumentWhere,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        submittedAt: true,
        documentId: true,
        score: true,
        feedback: true,
        rubricScores: true,
        overallScore: true,
        overallComment: true,
        numericPercentage: true,
        letterGrade: true,
        aiMeta: true,
        releasedAt: true,
        gradedAt: true,
        archivedAt: true,
        document: { select: previewSubmissionDocumentSelect },
      },
      orderBy: { submittedAt: 'desc' },
    }),
  ]);

  return { inProgressDocuments, submissions };
}
