/**
 * Whether a teacher can open an assignment type: the same check the type's
 * page makes, for the pages that hang off it (the How It Works guide, a
 * lesson's tutorial). The type has to be switched on for one of the
 * teacher's schools, or for the organization when they have no classes yet.
 */
import { prisma } from '~/utils/db.server';
import { isAssignmentTypeAvailableForAnyScope } from '~/utils/assignment-type-access.server';

export async function assignmentTypeAvailableForTeacher({
  assignmentTypeId,
  membershipId,
  organizationId,
}: {
  assignmentTypeId: string;
  membershipId: string;
  organizationId: string;
}): Promise<boolean> {
  const teacherClasses = await prisma.class.findMany({
    where: { teachers: { some: { id: membershipId } }, isArchived: false },
    select: { school: { select: { id: true, organizationId: true } } },
  });
  const scopes =
    teacherClasses.length === 0
      ? [{ organizationId, teacherProfileId: membershipId }]
      : teacherClasses.map((klass) => ({
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: membershipId,
        }));
  return isAssignmentTypeAvailableForAnyScope({ assignmentTypeId, scopes });
}
