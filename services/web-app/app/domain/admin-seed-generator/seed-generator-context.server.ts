import { prisma } from '~/utils/db.server';
import type { SeedGeneratorContext } from './seed-generator-propose.server';

export async function loadSeedGeneratorOrganizationContext(
  organizationId: string
): Promise<SeedGeneratorContext & { admissionMembershipId: string }> {
  const [
    organization,
    existingClasses,
    organizationAssignmentTypes,
    admissionMembership,
  ] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    }),
    prisma.class.findMany({
      where: { school: { organizationId } },
      select: { id: true, title: true, grade: true, period: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
    prisma.organizationAssignmentType.findMany({
      where: { organizationId },
      include: {
        assignmentType: {
          select: { id: true, title: true, description: true },
        },
      },
    }),
    prisma.orgMembership.findFirst({
      where: { organizationId, isActive: true },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  if (!organization) throw new Response('Not found', { status: 404 });
  if (!admissionMembership) {
    throw new Response(
      'This organization needs an active member before seed data can be generated.',
      { status: 422 }
    );
  }
  return {
    organizationId: organization.id,
    organizationName: organization.name,
    existingClasses,
    admissionMembershipId: admissionMembership.id,
    existingAssignmentTypes: organizationAssignmentTypes.map(
      (row) => row.assignmentType
    ),
  };
}
