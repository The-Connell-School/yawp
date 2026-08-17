import { prisma } from '~/utils/db.server';
import { schoolYearWhere } from '~/utils/school-year-scope.server';
import type { AssignmentTypeAccessScope } from '~/utils/assignment-type-access.server';

/**
 * The assignment-type access scopes a student writes under.
 *
 * A student may only start the kinds of writing their own teachers can assign, so
 * the scope is resolved through enrollment rather than ownership: one scope per
 * (class, teacher) pair, which is the same shape the teacher side builds from
 * ownership.
 *
 * Extracted from the dashboard loader so every student-facing page that offers a
 * kind of writing — the dashboard, and now starting a shared draft — asks the
 * same question. Two copies would be two chances to widen one and forget the
 * other.
 */
export async function studentAssignmentTypeScopes({
  membershipId,
  schoolYearScope,
}: {
  membershipId: string;
  schoolYearScope: string;
}): Promise<AssignmentTypeAccessScope[]> {
  const classes = await prisma.class.findMany({
    where: {
      students: { some: { id: membershipId } },
      ...schoolYearWhere(schoolYearScope),
    },
    select: {
      id: true,
      school: { select: { id: true, organizationId: true } },
      teachers: { select: { id: true } },
    },
  });

  return classes.flatMap((klass) =>
    klass.teachers.map((teacher) => ({
      organizationId: klass.school.organizationId,
      schoolId: klass.school.id,
      teacherProfileId: teacher.id,
    }))
  );
}
