import type { PrismaClient } from '@app/prisma';
import { AP_HISTORY_ASSIGNMENT_TYPE_KEY } from '~/domain/ap-history/schema';

const emptyJson = {};

async function attachDonorImageIfMissing(
  prisma: PrismaClient,
  assignmentTypeId: string,
  donor: { contentType: string; blob: Buffer; altText: string | null }
) {
  const existing = await prisma.assignmentTypeImage.findUnique({
    where: { assignmentTypeId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.assignmentTypeImage.create({
    data: {
      assignmentTypeId,
      contentType: donor.contentType,
      blob: donor.blob,
      altText: donor.altText,
    },
  });
}

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
    where: { kind: 'ap_history' },
    create: {
      ...base,
      title: 'AP History Essay',
      kind: 'ap_history',
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      position: 913,
    },
    update: {
      archivedAt: null,
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      title: 'AP History Essay',
    },
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

  const donorImage = await prisma.assignmentTypeImage.findFirst({
    where: {
      assignmentType: {
        ownerOrgId: null,
        ownerMembershipId: null,
        kind: { in: ['class_starter', 'prewriting', 'thesis_statement'] },
      },
    },
    select: { contentType: true, blob: true, altText: true },
  });
  if (!donorImage) return;

  const lockedTypes = await prisma.assignmentType.findMany({
    where: {
      ownerOrgId: null,
      ownerMembershipId: null,
      archivedAt: null,
      OR: [
        { kind: { in: ['daily_pages', 'act_writing', 'ap_history'] } },
        {
          title: {
            equals: 'The Thesis-Driven Essay',
            mode: 'insensitive',
          },
        },
        {
          title: { equals: 'AP English Language', mode: 'insensitive' },
        },
        {
          title: {
            equals: 'AP English Literature',
            mode: 'insensitive',
          },
        },
      ],
    },
    select: { id: true },
  });

  for (const type of lockedTypes) {
    await attachDonorImageIfMissing(prisma, type.id, donorImage);
  }
}
