/**
 * One-time-style Exit Ticket bootstrap: create the global type and org grants
 * only. Safe to call from preview tooling; production relies on migration
 * 20261008001100 for the same shape.
 *
 * Re-runs must not un-archive, overwrite title/description/position, replace
 * an image somebody uploaded, or inject the type into customized
 * school/teacher lists. The one image a re-run does replace is a card the
 * bootstrap itself shipped earlier (see EXIT_TICKET_RETIRED_ARTWORK_MD5S).
 */
import type { PrismaClient } from '../generated/prisma';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
import { syncSeedArtwork } from './assignment-type-artwork';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
  EXIT_TICKET_ASSIGNMENT_TYPE_ID,
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_INSTRUCTION_DATA,
  EXIT_TICKET_MODULE_DATA,
  parseExitTicketAllOrgsArg,
  parseExitTicketOrganizationArgs,
  resolveExitTicketOrganizationIds,
} from './exit-ticket-assignment-type-data';

export const EXIT_TICKET_MODULE_ID = 'cexitticketmod00000000001';
export const EXIT_TICKET_INSTRUCTION_ID = 'cexitticketins0000000001';

/**
 * md5 of the card migration 20261008001100 inserted into production: the torn
 * ticket on ruled notebook paper, the ship-review checksum for that migration.
 */
export const EXIT_TICKET_BOOTSTRAP_IMAGE_MD5 =
  '12e8c7775d7c5ad1ebd01cdffe70f949';

/**
 * md5 of every Exit Ticket card the repo has shipped before the one now in the
 * fixture. A database still showing one of these gets the fixture card on the
 * next run; a card somebody uploaded themselves is never touched.
 */
export const EXIT_TICKET_RETIRED_ARTWORK_MD5S: string[] = [
  EXIT_TICKET_BOOTSTRAP_IMAGE_MD5,
];

export type BootstrapExitTicketOptions = {
  organizationIds: string[];
  /**
   * When true, attach the fixture artwork if the type has no image yet, and
   * swap it in where the type still shows a card the repo shipped earlier.
   */
  attachImageIfMissing?: boolean;
};

export async function bootstrapExitTicketAssignmentType(
  prisma: PrismaClient,
  options: BootstrapExitTicketOptions
) {
  const { organizationIds, attachImageIfMissing = true } = options;

  let assignmentType = await prisma.assignmentType.findUnique({
    where: { kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND },
    select: { id: true },
  });

  if (!assignmentType) {
    const ownerOrgId = organizationIds[0] ?? null;
    if (!ownerOrgId) {
      throw new Error(
        'Cannot bootstrap Exit Ticket without at least one organization.'
      );
    }

    assignmentType = await prisma.assignmentType.create({
      data: {
        ...EXIT_TICKET_ASSIGNMENT_TYPE_DATA,
        id: EXIT_TICKET_ASSIGNMENT_TYPE_ID,
        kind: EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
        ownerOrgId,
        assignmentModules: {
          create: {
            id: EXIT_TICKET_MODULE_ID,
            ...EXIT_TICKET_MODULE_DATA,
            instructions: {
              create: {
                id: EXIT_TICKET_INSTRUCTION_ID,
                ...EXIT_TICKET_INSTRUCTION_DATA,
              },
            },
          },
        },
      },
      select: { id: true },
    });
  } else {
    const moduleExists = await prisma.assignmentModule.findFirst({
      where: { assignmentTypeId: assignmentType.id },
      select: { id: true },
    });
    if (!moduleExists) {
      await prisma.assignmentModule.create({
        data: {
          id: EXIT_TICKET_MODULE_ID,
          assignmentTypeId: assignmentType.id,
          ...EXIT_TICKET_MODULE_DATA,
          instructions: {
            create: {
              id: EXIT_TICKET_INSTRUCTION_ID,
              ...EXIT_TICKET_INSTRUCTION_DATA,
            },
          },
        },
      });
    }
  }

  for (const organizationId of organizationIds) {
    await prisma.organizationAssignmentType.upsert({
      where: {
        organizationId_assignmentTypeId: {
          organizationId,
          assignmentTypeId: assignmentType.id,
        },
      },
      create: { organizationId, assignmentTypeId: assignmentType.id },
      update: {},
    });
  }

  if (attachImageIfMissing) {
    const imageFixture = assignmentTypeImages.find(
      (row) => row.assignmentTypeId === EXIT_TICKET_ASSIGNMENT_TYPE_ID
    );
    if (imageFixture) {
      await syncSeedArtwork(
        prisma,
        assignmentType.id,
        {
          blob: Buffer.from(imageFixture.blob.base64, 'base64'),
          contentType: imageFixture.contentType,
          altText: imageFixture.altText ?? '',
        },
        EXIT_TICKET_RETIRED_ARTWORK_MD5S
      );
    }
  }

  return { assignmentTypeId: assignmentType.id };
}

export async function resolveBootstrapOrganizationIds(
  prisma: PrismaClient,
  argv: string[]
) {
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  const { organizationIds, unknownOrganizationIds } =
    resolveExitTicketOrganizationIds({
      requestedOrganizationIds: parseExitTicketOrganizationArgs(argv),
      existingOrganizationIds: organizations.map((org) => org.id),
      allOrganizations: parseExitTicketAllOrgsArg(argv),
    });
  if (unknownOrganizationIds.length > 0) {
    throw new Error(
      `Unknown organization ids: ${unknownOrganizationIds.join(', ')}`
    );
  }
  return organizationIds;
}
