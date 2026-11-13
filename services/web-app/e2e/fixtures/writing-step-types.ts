import { createE2EPrismaClient } from '../prisma-client';

const TITLES = { prewriting: 'Pre-Writing', thesis_statement: 'Thesis Statement' } as const;

/**
 * The Pre-Writing or Thesis Statement type (found by its unique `kind`, made
 * if this database has none), switched on for this school.
 */
export async function ensureWritingStepType(
  organizationId: string,
  kind: keyof typeof TITLES
): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    // `kind` is unique: the catalog (or an earlier spec) may have made it.
    const existing = await prisma.assignmentType.findFirst({
      where: { kind },
      select: { id: true },
    });
    const id =
      existing?.id ??
      (
        await prisma.assignmentType.create({
          data: {
            title: TITLES[kind],
            kind,
            description: `${TITLES[kind]}, a step of the thesis-driven essay.`,
            position: kind === 'prewriting' ? 98001 : 98002,
            ownerOrgId: organizationId,
          },
          select: { id: true },
        })
      ).id;
    await prisma.organizationAssignmentType.upsert({
      where: { organizationId_assignmentTypeId: { organizationId, assignmentTypeId: id } },
      create: { organizationId, assignmentTypeId: id },
      update: {},
    });
    return id;
  } finally {
    await prisma.$disconnect();
  }
}
