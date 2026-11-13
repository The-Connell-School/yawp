import { prisma } from '~/utils/db.server';

export { buildAssignmentTryItHref } from './teacher-assignment-try-it-href';

export async function resolveTeacherTryItClassAssignment({
  assignmentId,
  teacherMembershipId,
  classId,
}: {
  assignmentId: string;
  teacherMembershipId: string;
  classId?: string | null;
}) {
  return prisma.classAssignment.findFirst({
    where: {
      assignmentId,
      class: {
        isArchived: false,
        teachers: { some: { id: teacherMembershipId } },
        ...(classId ? { id: classId } : {}),
      },
    },
    orderBy: { createdAt: 'asc' },
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
}
