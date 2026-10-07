import { prisma } from '~/utils/db.server';
import type { FreeTierApplication } from '@app/prisma';

/**
 * Provisions a FREE_CLASSROOM org for an approved application when Free Tier A
 * has not landed yet. Idempotent: safe to call from onApplicationApproved.
 */
export async function provisionFreeClassroom(
  application: Pick<FreeTierApplication, 'id' | 'email' | 'name' | 'schoolName' | 'userId' | 'organizationId'>
) {
  if (application.organizationId) {
    return { organizationId: application.organizationId };
  }
  if (!application.userId) {
    throw new Error('Cannot provision free classroom without userId');
  }

  return prisma.$transaction(async (tx) => {
    const fresh = await tx.freeTierApplication.findUnique({
      where: { id: application.id },
      select: { organizationId: true, userId: true, schoolName: true, location: true },
    });
    if (!fresh?.userId) throw new Error('Application missing user');
    if (fresh.organizationId) return { organizationId: fresh.organizationId };

    const org = await tx.organization.create({
      data: {
        name: fresh.schoolName,
        plan: 'FREE_CLASSROOM',
        numOfStudentSeats: 35,
      },
      select: { id: true },
    });
    const school = await tx.school.create({
      data: {
        name: fresh.schoolName,
        organizationId: org.id,
        code: `free-${org.id.slice(0, 8)}`,
      },
      select: { id: true },
    });
    await tx.orgMembership.create({
      data: {
        userId: fresh.userId,
        organizationId: org.id,
        role: 'TEACHER',
        schools: { connect: [{ id: school.id }] },
        isOrgOwner: true,
      },
    });
    await tx.freeTierApplication.update({
      where: { id: application.id },
      data: { organizationId: org.id },
    });
    return { organizationId: org.id };
  });
}
