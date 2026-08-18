import type { Prisma, PrismaClient } from '../generated/prisma';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
  LOCAL_DEV_PASSWORD,
  LOCAL_DEV_PERSONAS,
  type LocalDevPersona,
} from './local-dev/dev-personas';
import { seedCollaborationDemoData } from './local-dev/seed-collaboration';
import { seedSyntheticLocalDevData } from './local-dev/seed-synthetic-data';
import { loadProdFidelityBundle } from './local-dev/import-prod-fidelity-fixtures';
import {
  generatePreviewAccessCode,
  generateUniquePreviewAccessCode,
  PREVIEW_ACCESS_CODE_PATTERN,
} from '../preview-access-code';

export const DEFAULT_PREVIEW_SEAT_COUNT = 1;

export type PreviewSeatDefinition = {
  number: number;
  label: string;
  organizationId: string;
  organizationName: string;
  adoptExisting: boolean;
  personas: LocalDevPersona[];
  schoolCodes: [string, string, string];
  previewSeatCode?: string;
};

export type PreviewSeatClient = PrismaClient | Prisma.TransactionClient;
export type PreviewSeatCreator = (
  transaction: PreviewSeatClient,
  seat: PreviewSeatDefinition
) => Promise<void>;

function seatLabel(number: number) {
  return number === 1 ? 'Master' : `Seat ${number}`;
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
    // Every seat gets the same cast of personas the master seat has, platform admin
    // included. Withholding it from later seats would mean the Admin surfaces --
    // including the control that creates seats -- disappear the moment you switch to one,
    // which is the opposite of what previews are for. Seats stop testers colliding by
    // accident; they are not a security boundary between them.
    isAdmin: persona.isAdmin,
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
  count = DEFAULT_PREVIEW_SEAT_COUNT
): PreviewSeatDefinition[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new Error('Preview seat count must be a positive integer.');
  }

  return Array.from({ length: count }, (_, index) =>
    buildPreviewSeatDefinition(index + 1)
  );
}

export function buildPreviewSeatDefinition(
  number: number,
  options: { previewSeatCode?: string } = {}
): PreviewSeatDefinition {
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new Error('Preview seat number must be a positive integer.');
  }
  const label = seatLabel(number);
  return {
    number,
    label,
    organizationId:
      number === 1 ? adoptedOrganizationId() : `preview-seat-${number}`,
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
    ...options,
  };
}

export async function createPreviewSeat(
  transaction: PreviewSeatClient,
  seat: PreviewSeatDefinition
) {
  await transaction.organization.create({
    data: {
      id: seat.organizationId,
      name: seat.organizationName,
      numOfStudentSeats: 200,
      numOfTeacherSeats: 40,
      reporterEnabled: true,
      classInsightsEnabled: false,
      previewSeatCode: seat.previewSeatCode,
    },
  });

  const bundle = await loadProdFidelityBundle();
  const assignmentTypeIds = bundle.assignmentTypes.map(({ id }) => String(id));
  const teacherTrainingIds = bundle.teacherTrainings.map(({ id }) =>
    String(id)
  );
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

  const context = await seedSyntheticLocalDevData(transaction, {
    organizationId: seat.organizationId,
    personas: seat.personas,
    schoolCodes: seat.schoolCodes,
    assignmentTypeIds,
    teacherTrainingIds,
  });

  // Same reasoning as the persona cast above: a seat that is missing the group
  // work is a seat where the thing under review cannot be reviewed.
  await seedCollaborationDemoData(transaction, {
    organizationId: seat.organizationId,
    schoolId: context.schoolIds[0]!,
    teacherMembershipIds: [
      context.personas.teacher.membershipId,
      context.personas.owner.membershipId,
      context.personas.admin.membershipId,
      context.personas['teacher-multi'].membershipId,
    ],
    primaryTeacherMembershipId: context.personas.teacher.membershipId,
    personaStudentMembershipIds: {
      student: context.personas.student.membershipId,
      'student-submitted': context.personas['student-submitted'].membershipId,
      'student-graded': context.personas['student-graded'].membershipId,
      'student-unreleased': context.personas['student-unreleased'].membershipId,
    },
    password: seat.personas[0]?.password ?? LOCAL_DEV_PASSWORD,
    emailSuffix: seat.number === 1 ? '' : `.seat-${seat.number}`,
  });

  const [insights] = await enableClassInsightsForOrganizations(transaction, [
    seat.organizationId,
  ]);
  if (!insights?.enabled) {
    throw new Error(
      `Could not enable class insights for preview seat ${seat.organizationId}.`
    );
  }
}

export async function ensurePreviewSeats(
  prisma: PrismaClient,
  seats = buildPreviewSeatDefinitions(),
  createSeat: PreviewSeatCreator = createPreviewSeat
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
        `${seat.label} seat requires existing organization ${seat.organizationId}.`
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

export type LegacyPreviewAccessSeat = {
  code: string;
  organizationId: string;
  label: string;
};

export async function backfillLegacyPreviewSeatCodes(
  prisma: PrismaClient,
  seats: LegacyPreviewAccessSeat[]
) {
  const results: Array<{
    organizationId: string;
    status: 'master' | 'backfilled' | 'existing' | 'missing';
  }> = [];

  for (const seat of seats) {
    const code = seat.code.trim().toLowerCase();
    if (!PREVIEW_ACCESS_CODE_PATTERN.test(code)) {
      throw new Error(
        `Invalid preview access code for ${seat.organizationId}.`
      );
    }
    if (seat.organizationId === LOCAL_DEV_ORG_ID) {
      results.push({ organizationId: seat.organizationId, status: 'master' });
      continue;
    }

    const updated = await prisma.organization.updateMany({
      where: { id: seat.organizationId, previewSeatCode: null },
      data: { previewSeatCode: code },
    });
    if (updated.count > 0) {
      results.push({
        organizationId: seat.organizationId,
        status: 'backfilled',
      });
      continue;
    }

    const existing = await prisma.organization.findUnique({
      where: { id: seat.organizationId },
      select: { id: true, previewSeatCode: true },
    });
    results.push({
      organizationId: seat.organizationId,
      status: existing ? 'existing' : 'missing',
    });
  }

  return results;
}

function isUniqueConstraintError(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

export async function createRuntimePreviewSeat(
  prisma: PrismaClient,
  options: {
    reservedCodes?: string[];
    generateCode?: () => string;
    maxAttempts?: number;
  } = {},
  createSeat: PreviewSeatCreator = createPreviewSeat
) {
  const {
    reservedCodes = [],
    generateCode = generatePreviewAccessCode,
    maxAttempts = 5,
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (transaction) => {
          const organizations = await transaction.organization.findMany({
            select: { id: true, previewSeatCode: true },
          });
          const highestSeatNumber = organizations.reduce(
            (highest, organization) => {
              if (organization.id === adoptedOrganizationId()) {
                return Math.max(highest, 1);
              }
              const match = /^preview-seat-([1-9][0-9]*)$/.exec(
                organization.id
              );
              return match ? Math.max(highest, Number(match[1])) : highest;
            },
            1
          );
          const previewSeatCode = generateUniquePreviewAccessCode(
            [
              ...reservedCodes,
              ...organizations.flatMap(({ previewSeatCode }) =>
                previewSeatCode ? [previewSeatCode] : []
              ),
            ],
            generateCode
          );
          const seat = buildPreviewSeatDefinition(highestSeatNumber + 1, {
            previewSeatCode,
          });

          await createSeat(transaction, seat);
          return {
            organizationId: seat.organizationId,
            label: seat.label,
            organizationName: seat.organizationName,
            previewSeatCode,
          };
        },
        // Seeding a seat loads the prod-fidelity bundle and writes an entire organization.
        // The deploy path fits inside Prisma's five-second default, but this one runs
        // inside a web request on a shared preview box, where the margin is thin enough
        // that a timeout would abort the seat halfway.
        { maxWait: 10_000, timeout: 120_000 }
      );
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new Error('Could not create a unique preview seat.');
}
