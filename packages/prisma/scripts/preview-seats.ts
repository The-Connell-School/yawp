import { randomUUID } from 'node:crypto';
import type { Prisma, PrismaClient } from '../generated/prisma';
import { enableClassInsightsForOrganizations } from './local-dev/class-insights';
import {
  LOCAL_DEV_ORG_ID,
  LOCAL_DEV_ORG_NAME,
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
      // Same reasoning as the local-dev seed: a preview seat is for looking at
      // the build, so the dark-by-default flag is on here.
      writingPracticeEnabled: true,
      classInsightsEnabled: false,
      previewSeatCode: seat.previewSeatCode,
    },
  });

  const bundle = await loadProdFidelityBundle();
  const assignmentTypeIds = bundle.assignmentTypes
    .filter(
      (assignmentType) =>
        assignmentType.ownerOrgId == null ||
        seat.organizationId === LOCAL_DEV_ORG_ID
    )
    .map(({ id }) => String(id));
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

  await seedSyntheticLocalDevData(transaction, {
    organizationId: seat.organizationId,
    personas: seat.personas,
    schoolCodes: seat.schoolCodes,
    assignmentTypeIds,
    teacherTrainingIds,
  });

  await seedCollaborationDemoForSeat(transaction, seat);

  const [insights] = await enableClassInsightsForOrganizations(transaction, [
    seat.organizationId,
  ]);
  if (!insights?.enabled) {
    throw new Error(
      `Could not enable class insights for preview seat ${seat.organizationId}.`
    );
  }
}

export async function enableWritingPracticeForPreviewOrganizations(
  prisma: PrismaClient,
  organizationIds: string[]
) {
  const uniqueOrganizationIds = [...new Set(organizationIds)];
  if (uniqueOrganizationIds.length === 0) return { count: 0 };

  return prisma.organization.updateMany({
    where: {
      id: { in: uniqueOrganizationIds },
      writingPracticeEnabled: false,
    },
    data: { writingPracticeEnabled: true },
  });
}

/**
 * Whether this environment is a disposable per-PR preview.
 *
 * Read from the database name, which `preview-env.mjs` derives from the slug:
 * `yawp_pr_267` for a pull request, `yawp_demo` for the named demo box. That is a
 * roundabout-looking source for it, and the reason is worth writing down.
 *
 * The preview control plane — everything under `scripts/preview/` — is checked out
 * from the default branch on purpose, so that a pull request cannot change what
 * runs on the shared preview host. A flag set there would therefore do nothing
 * for the branch that added it and would only start working once merged, which is
 * exactly when nobody needs it any more. This file runs from the PR's own source,
 * so it has to derive the answer from what the container already gives it.
 *
 * What it gates: whether a seat whose organization already exists may be topped
 * up with data the branch added after that database was created. A per-PR preview
 * is disposable and belongs to one branch, so it should show that branch's data.
 * The demo box is long-lived and someone demos from it — redeploying it ships code
 * and not data, and "reseeding an existing seat performs zero writes and preserves
 * divergence" stays true there.
 */
function seatTopUpEnabled() {
  const explicit = process.env.PREVIEW_SEAT_TOP_UP;
  if (explicit) return explicit === '1';
  return /\/yawp_pr_\d+(\?|$)/.test(process.env.DATABASE_URL ?? '');
}

/**
 * The collaborative GBA 300 demo for one seat.
 *
 * Runs at creation and, on a disposable preview, on later deploys too. It
 * resolves what it needs by persona email and no-ops once the class is there, so
 * it is safe to run repeatedly and safe to retry after a failure part-way.
 *
 * Same reasoning as the persona cast above: a seat missing the group work is a
 * seat where the thing under review cannot be reviewed.
 */
export async function seedCollaborationDemoForSeat(
  prisma: PreviewSeatClient,
  seat: PreviewSeatDefinition
) {
  const seeded = await seedCollaborationDemoData(prisma, {
    organizationId: seat.organizationId,
    schoolCode: seat.schoolCodes[0],
    personas: seat.personas,
    emailSuffix: seat.number === 1 ? '' : `.seat-${seat.number}`,
  });

  // Every path through this says what it did. A step that writes data silently
  // cannot be checked from the deploy log, and the deploy log is the only view
  // anyone has of a preview's database — the environment itself is behind an
  // access gate and there is no console.
  if (seeded) {
    console.log(
      `Collaboration demo seeded for ${seat.label}: ${seeded.groupIds.length} groups, ${seeded.cohort.length} students.`
    );
  }

  // Top-up: ensure the Daily Pages Engagement preview assignment exists and is
  // pinned to the engagement rubric. Safe to run repeatedly.
  try {
    const teacherEmail = seat.personas.find((p) => p.key === 'teacher')?.email;
    if (!teacherEmail) return;
    const teacher = await prisma.orgMembership.findFirst({
      where: { user: { email: teacherEmail } },
      select: { id: true },
    });
    if (!teacher) return;
    const klass = await prisma.class.findFirst({
      where: {
        isArchived: false,
        teachers: { some: { id: teacher.id } },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!klass) return;
    const dailyPagesType = await prisma.assignmentType.findFirst({
      where: { kind: 'daily_pages', archivedAt: null },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    if (!dailyPagesType) return;
    // Ensure the engagement rubric exists and has a current revision.
    const engagementModule = (await import('../../../services/web-app/app/domain/rubrics/library/daily-pages-engagement.json', {
      with: { type: 'json' },
    })) as unknown as { default: any };
    const engagementSchema = (engagementModule as any).default ?? null;
    const rubricName = (engagementSchema as any)?.name ?? 'daily-pages-engagement';
    const rubricTitle = (engagementSchema as any)?.title ?? 'Daily Pages engagement';
    let rubric = await prisma.rubric.findUnique({
      where: { name: String(rubricName) },
      include: { currentRevision: true },
    });
    if (!rubric) {
      rubric = await prisma.rubric.create({
        data: {
          name: String(rubricName),
          title: String(rubricTitle),
          schemaJson: engagementSchema as Prisma.InputJsonValue,
        },
        include: { currentRevision: true },
      });
    }
    if (!rubric.currentRevision) {
      const latest = await prisma.rubricRevision.findFirst({
        where: { rubricName: String(rubricName) },
        orderBy: { version: 'desc' },
      });
      const revision = await prisma.rubricRevision.create({
        data: {
          id: randomUUID(),
          rubricName: String(rubricName),
          version: (latest?.version ?? 0) + 1,
          schemaJson: engagementSchema as Prisma.InputJsonValue,
          fingerprint: `seed-${rubricName}`,
          requestId: randomUUID(),
          requestHash: `seed-${rubricName}-${Date.now()}`,
          createdBy: 'seed-preview-topup',
          reason: 'Preview engagement rubric for Daily Pages',
        } as any,
      });
      await prisma.rubric.update({
        where: { id: rubric.id },
        data: { currentRevisionId: revision.id },
      });
      rubric = await prisma.rubric.findUnique({
        where: { id: rubric.id },
        include: { currentRevision: true },
      });
    }
    // Create if missing.
    const existing = await prisma.assignment.findFirst({
      where: {
        title: 'Engagement Check (Preview)',
        assignmentTypeId: dailyPagesType.id,
        classAssignments: { some: { classId: klass.id } },
      },
      select: { id: true },
    });
    if (!existing) {
      const assignment = await prisma.assignment.create({
        data: {
          assignmentTypeId: dailyPagesType.id,
          title: 'Engagement Check (Preview)',
          prompt: 'Write freely for ten minutes about something you noticed today.',
          submitForGrade: true,
          pointValue: 30,
          rubricRevisionId: rubric!.currentRevision!.id,
        },
      });
      await prisma.classAssignment.create({
        data: { assignmentId: assignment.id, classId: klass.id },
      });
      console.log(
        `Engagement preview assignment created for ${seat.label} (${seat.organizationId}).`
      );
    } else {
      console.log(
        `Engagement preview assignment already present for ${seat.label} (${seat.organizationId}).`
      );
    }
  } catch (error) {
    console.error('Engagement preview assignment top-up failed:', error);
  }
}

export async function ensurePreviewSeats(
  prisma: PrismaClient,
  seats = buildPreviewSeatDefinitions(),
  createSeat: PreviewSeatCreator = createPreviewSeat,
  topUpSeat: PreviewSeatCreator = seedCollaborationDemoForSeat
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
      if (seatTopUpEnabled()) await topUpSeat(prisma, seat);
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
      }, { maxWait: 10_000, timeout: 120_000 });
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
  createSeat: PreviewSeatCreator = createPreviewSeat,
  topUpSeat: PreviewSeatCreator = seedCollaborationDemoForSeat
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
        // Both deploy and request paths need the same bounded allowance on a shared
        // preview host; the five-second default can abort a whole seat halfway.
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
