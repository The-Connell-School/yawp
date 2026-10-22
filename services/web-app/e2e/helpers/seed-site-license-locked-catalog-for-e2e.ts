import type { PrismaClient } from '@app/prisma';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

const emptyJson = {};

/** Minimal platform catalog rows so locked picker tiles render in CI E2E. */
export async function seedSiteLicenseLockedCatalogForE2E(
  prisma: PrismaClient
) {
  const base = {
    ownerOrgId: null,
    ownerMembershipId: null,
    archivedAt: null,
    scoringScaleJson: emptyJson,
    rubricJson: emptyJson,
    gradingPromptConfigJson: emptyJson,
    gradingOutputSchemaJson: emptyJson,
  };

  await prisma.assignmentType.upsert({
    where: { kind: 'daily_pages' },
    create: {
      ...base,
      title: 'Daily Pages',
      kind: 'daily_pages',
      position: 911,
    },
    update: { archivedAt: null, title: 'Daily Pages' },
  });

  await prisma.assignmentType.upsert({
    where: { kind: 'act_writing' },
    create: {
      ...base,
      title: 'ACT Writing Section',
      kind: 'act_writing',
      position: 912,
    },
    update: { archivedAt: null, title: 'ACT Writing Section' },
  });

  await prisma.assignmentType.upsert({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    create: {
      ...base,
      title: 'AP History Essay',
      kind: 'ap_history',
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      position: 913,
    },
    update: { archivedAt: null },
  });

  const thesis = await prisma.assignmentType.findFirst({
    where: {
      title: { equals: 'The Thesis-Driven Essay', mode: 'insensitive' },
      ownerOrgId: null,
      ownerMembershipId: null,
    },
    select: { id: true },
  });
  if (!thesis) {
    await prisma.assignmentType.create({
      data: {
        ...base,
        title: 'The Thesis-Driven Essay',
        position: 910,
      },
    });
  }

  for (const [position, title] of [
    [914, 'AP English Language'],
    [915, 'AP English Literature'],
  ] as const) {
    const existing = await prisma.assignmentType.findFirst({
      where: {
        title: { equals: title, mode: 'insensitive' },
        ownerOrgId: null,
        ownerMembershipId: null,
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.assignmentType.create({
        data: { ...base, title, position },
      });
    }
  }
}
