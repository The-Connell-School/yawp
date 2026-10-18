/**
 * Whether a teacher can use a shared assignment in their own classes: their
 * school must offer its assignment type. Mirrors how the assignment type page
 * decides access (one scope per class the teacher teaches, else the school).
 */
import { prisma } from '~/utils/db.server';
import {
  isAssignmentTypeAvailableForAnyScope,
  type AssignmentTypeAccessScope,
} from '~/utils/assignment-type-access.server';

export async function canMembershipUseAssignmentType(params: {
  membershipId: string;
  organizationId: string;
  role: string;
  assignmentTypeId: string;
}): Promise<boolean> {
  if (params.role !== 'TEACHER') return false;
  const classes = await prisma.class.findMany({
    where: { teachers: { some: { id: params.membershipId } }, isArchived: false },
    select: { school: { select: { id: true, organizationId: true } } },
  });
  const scopes: AssignmentTypeAccessScope[] =
    classes.length === 0
      ? [{ organizationId: params.organizationId, teacherProfileId: params.membershipId }]
      : classes.map((klass) => ({
          organizationId: klass.school.organizationId,
          schoolId: klass.school.id,
          teacherProfileId: params.membershipId,
        }));
  return isAssignmentTypeAvailableForAnyScope({ assignmentTypeId: params.assignmentTypeId, scopes });
}
