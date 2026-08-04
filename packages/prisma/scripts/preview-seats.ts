import type { Prisma, PrismaClient } from '../generated/prisma';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PERSONAS,
  type LocalDevPersona,
} from './local-dev/dev-personas';
import { seedSyntheticLocalDevData } from './local-dev/seed-synthetic-data';
import { loadProdFidelityBundle } from './local-dev/import-prod-fidelity-fixtures';

export const DEFAULT_PREVIEW_SEAT_COUNT = 6;

export type PreviewSeatDefinition = {
  number: number;
  label: string;
  organizationId: string;
  organizationName: string;
  adoptExisting: boolean;
  personas: LocalDevPersona[];
  schoolCodes: [string, string, string];
};

type PreviewSeatClient = PrismaClient | Prisma.TransactionClient;
export type PreviewSeatCreator = (
  transaction: PreviewSeatClient,
  seat: PreviewSeatDefinition,
) => Promise<void>;

function seatLabel(number: number) {
  if (number === 1) return 'Brian Connell';
  if (number === 2) return 'Bryant Brock';
  return `Seat ${number}`;
}

function qualifyEmail(email: string, seatNumber: number) {
  if (seatNumber === 1) return email;
  const separator = email.lastIndexOf('@');
  return `${email.slice(0, separator)}.seat-${seatNumber}${email.slice(separator)}`;
}

function personasForSeat(number: number) {
  return LOCAL_DEV_PERSONAS.map((persona) => ({
    ...persona,
    email: qualifyEmail(persona.email, number),
    // Preview-seat admins own their organization but are not platform-wide admins.
    // A global admin can list and mutate every organization, which would defeat seat
    // isolation. Brian's adopted account remains untouched.
    isAdmin: number === 1 ? persona.isAdmin : false,
  }));
}

/**
 * Which organization seat 1 adopts. Defaults to the local-dev org, which is what both
 * preview and demo hold today. Overridable so a database seeded under a different org id
 * (the E2E fixture, for one) can still exercise adoption rather than skipping it — the
 * adopt path must never synthesize an org, so it has to be pointed at a real one.
 */
function adoptedOrganizationId() {
  return process.env.PREVIEW_SEAT_ADOPT_ORGANIZATION_ID || LOCAL_DEV_ORG_ID;
}

export function buildPreviewSeatDefinitions(
  count = DEFAULT_PREVIEW_SEAT_COUNT,
): PreviewSeatDefinition[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Preview seat count must be a positive integer.');
  }

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const label = seatLabel(number);
    const organizationId =
      number === 1 ? adoptedOrganizationId() : `preview-seat-${number}`;
    return {
      number,
      label,
      organizationId,
      organizationName:
        number === 1 ? LOCAL_DEV_ORG_NAME : `Yawp Preview - ${label}`,
      adoptExisting: number === 1,
      personas: personasForSeat(number),
      schoolCodes:
        number === 1
          ? ['DEV-SCH-1', 'DEV-SCH-2', 'DEV-SCH-3']
          : [
              `SEAT-${number}-SCH-1`,
              `SEAT-${number}-SCH-2`,
              `SEAT-${number}-SCH-3`,
            ],
    };
  });
}

export async function createPreviewSeat(
  transaction: PreviewSeatClient,
  seat: PreviewSeatDefinition,
) {
  await transaction.organization.create({
    data: {
      id: seat.organizationId,
      name: seat.organizationName,
      numOfStudentSeats: 200,
      numOfTeacherSeats: 40,
      reporterEnabled: true,
      classInsightsEnabled: false,
    },
  });

  const bundle = await loadProdFidelityBundle();
  const assignmentTypeIds = bundle.assignmentTypes.map(({ id }) => String(id));
  const teacherTrainingIds = bundle.teacherTrainings.map(({ id }) => String(id));
  const assignmentTypes = await transaction.assignmentType.findMany({
    where: { id: { in: assignmentTypeIds } },
    select: { id: true },
  });
  if (assignmentTypes.length !== assignmentTypeIds.length) {
    throw new Error('Preview seat template catalog is incomplete.');
  }
  await transaction.organizationAssignmentType.createMany({
    data: assignmentTypes.map(({ id: assignmentTypeId }) => ({
      organizationId: seat.organizationId,
      assignmentTypeId,
    })),
  });

  await seedSyntheticLocalDevData(transaction, {
    organizationId: seat.organizationId,
    personas: seat.personas,
    schoolCodes: seat.schoolCodes,
    assignmentTypeIds,
    teacherTrainingIds,
  });

  const [insights] = await enableClassInsightsForOrganizations(transaction, [
    seat.organizationId,
  ]);
  if (!insights?.enabled) {
    throw new Error(
      `Could not enable class insights for preview seat ${seat.organizationId}.`,
    );
  }
}

export async function ensurePreviewSeats(
  prisma: PrismaClient,
  seats = buildPreviewSeatDefinitions(),
  createSeat: PreviewSeatCreator = createPreviewSeat,
) {
  const results: Array<{
    organizationId: string;
    status: 'adopted' | 'existing' | 'created';
  }> = [];

  for (const seat of seats) {
    const existing = await prisma.organization.findUnique({
      where: { id: seat.organizationId },
      select: { id: true },
    });
    if (existing) {
      results.push({
        organizationId: seat.organizationId,
        status: seat.adoptExisting ? 'adopted' : 'existing',
      });
      continue;
    }

    if (seat.adoptExisting) {
      throw new Error(
        `${seat.label} seat requires existing organization ${seat.organizationId}.`,
      );
    }

    try {
      const created = await prisma.$transaction(async (transaction) => {
        const appeared = await transaction.organization.findUnique({
          where: { id: seat.organizationId },
          select: { id: true },
        });
        if (appeared) return false;
        await createSeat(transaction, seat);
        return true;
      });
      results.push({
        organizationId: seat.organizationId,
        status: created ? 'created' : 'existing',
      });
    } catch (error) {
      // A concurrent deploy may have won the create race. Only suppress the error if
      // the complete transaction committed an organization; otherwise allow retry.
      const appeared = await prisma.organization.findUnique({
        where: { id: seat.organizationId },
        select: { id: true },
      });
      if (!appeared) throw error;
      results.push({ organizationId: seat.organizationId, status: 'existing' });
    }
  }

  return results;
}
