/**
 * One-time-style Exit Ticket bootstrap: create the global type and org grants
 * only. Safe to call from preview tooling; production relies on migration
 * 20261007174800 for the same shape.
 *
 * Re-runs must not un-archive, overwrite title/description/position/image, or
 * inject the type into customized school/teacher lists.
 */
import type { PrismaClient } from '../generated/prisma';
import assignmentTypeImages from '../fixtures/prod-fidelity/assignment-type-images.json';
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

export type BootstrapExitTicketOptions = {
  organizationIds: string[];
  /** When true, attach fixture artwork only if the type has no image yet. */
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
    const existingImage = await prisma.assignmentTypeImage.findUnique({
      where: { assignmentTypeId: assignmentType.id },
      select: { id: true },
    });
    if (!existingImage) {
      const imageFixture = assignmentTypeImages.find(
        (row) => row.assignmentTypeId === EXIT_TICKET_ASSIGNMENT_TYPE_ID
      );
      if (imageFixture) {
        const blob = Buffer.from(imageFixture.blob.base64, 'base64');
        await prisma.assignmentTypeImage.create({
          data: {
            assignmentTypeId: assignmentType.id,
            contentType: imageFixture.contentType,
            altText: imageFixture.altText,
            blob,
          },
        });
      }
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
