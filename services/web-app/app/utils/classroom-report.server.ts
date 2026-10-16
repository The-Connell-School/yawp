import type { PrismaClient, Prisma } from '@app/prisma';
import { prisma } from '~/utils/db.server';
import type { ClassroomActivityReport } from './classroom-report';

/** IDs must come from requireMembership, never query/form parameters. */
export async function getClassroomActivityReport(
  scope: { membershipId: string; organizationId: string },
  client: PrismaClient = prisma,
  generatedAt = new Date(),
): Promise<ClassroomActivityReport> {
  const authorizedClass: Prisma.ClassWhereInput = {
    isArchived: false,
    teachers: { some: { id: scope.membershipId, role: 'TEACHER', isActive: true, organizationId: scope.organizationId } },
    school: { organizationId: scope.organizationId },
  };
  // One consistent snapshot; counts cannot mix enrollments or classes from
  // different moments. No document content, names or grades are selected.
  return client.$transaction(async (tx) => {
    const activeClasses = await tx.class.count({ where: authorizedClass });
    const students = await tx.orgMembership.findMany({
      where: { organizationId: scope.organizationId, role: 'STUDENT', isActive: true, classesAsStudent: { some: authorizedClass } },
      distinct: ['userId'],
      select: { userId: true },
    });
    const assignments = await tx.classAssignment.count({ where: { class: authorizedClass } });
    // Count documents with qualifying submissions rather than submissions or
    // revisions. This also gives group-owned artifacts the same weight as solo work.
    const submittedWriting = await tx.document.count({
      where: {
        classAssignment: { class: authorizedClass },
        deletedAt: null,
        archivedAt: null,
        submissions: { some: { archivedAt: null, unsubmittedAt: null } },
        OR: [
          { artifactKind: 'STUDENT', membership: { role: 'STUDENT', organizationId: scope.organizationId } },
          { artifactKind: 'ASSIGNMENT_GROUP', group: { isNot: null } },
        ],
      },
    });
    return { activeClasses, enrolledStudents: students.length, assignments, submittedWriting, generatedAt: generatedAt.toISOString() };
  }, { isolationLevel: 'RepeatableRead' });
}
