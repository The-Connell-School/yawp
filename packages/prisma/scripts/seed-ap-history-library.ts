/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';
import { AP_HISTORY_SEED_MODULES } from './ap-history-module-data';
import { isLocalDatabaseUrl } from './seed-overlay-connection';

const AP_HISTORY_ASSIGNMENT_TYPE_KEY = 'ap_history_essay';

const ASSIGNMENT_TYPE_DATA = {
  title: 'AP History Essay',
  description: 'Curated APUSH DBQ and LEQ practice with AP rubric coaching.',
  position: 50,
} as const;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

function getSchemaFromDatabaseUrl(url: string): string | undefined {
  const match = url.match(/[?&]schema=([^&]+)/i);
  if (!match) return undefined;
  return decodeURIComponent(match[1]);
}

const schema =
  process.env.DATABASE_SCHEMA?.trim() ||
  getSchemaFromDatabaseUrl(connectionString);

const isLocal = isLocalDatabaseUrl(connectionString);
const isSimpleLocal =
  !schema &&
  (connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1'));

const adapter = isSimpleLocal
  ? new PrismaPg({ connectionString, ssl: false })
  : new PrismaPg(
      {
        connectionString,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      },
      schema ? { schema } : undefined
    );

const prisma = new PrismaClient({ adapter });

async function seedApHistoryLibrary() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!org) {
    throw new Error('Cannot seed AP History library without an organization.');
  }

  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    update: {
      ...ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...ASSIGNMENT_TYPE_DATA,
      systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: AP_HISTORY_SEED_MODULES.map((moduleData) => ({
          title: moduleData.title,
          position: moduleData.position,
          description: moduleData.description,
          tutorInstructions: moduleData.tutorInstructions,
          instructions: {
            create: moduleData.instructions,
          },
        })),
      },
    },
    select: { id: true },
  });

  await prisma.organizationAssignmentType.upsert({
    where: {
      organizationId_assignmentTypeId: {
        organizationId: org.id,
        assignmentTypeId: assignmentType.id,
      },
    },
    create: {
      organizationId: org.id,
      assignmentTypeId: assignmentType.id,
    },
    update: {},
  });

  // Position 1 upgrades the legacy catch-all module in place so existing
  // sessions stay attached; positions 2-4 are additive and start on demand.
  for (const moduleData of AP_HISTORY_SEED_MODULES) {
    const moduleFields = {
      title: moduleData.title,
      position: moduleData.position,
      description: moduleData.description,
      tutorInstructions: moduleData.tutorInstructions,
    };
    const existingModule = await prisma.assignmentModule.findFirst({
      where: {
        assignmentTypeId: assignmentType.id,
        position: moduleData.position,
        deletedAt: null,
      },
      select: { id: true },
    });
    const assignmentModule = existingModule
      ? await prisma.assignmentModule.update({
          where: { id: existingModule.id },
          data: moduleFields,
          select: { id: true },
        })
      : await prisma.assignmentModule.create({
          data: { ...moduleFields, assignmentTypeId: assignmentType.id },
          select: { id: true },
        });

    for (const instructionData of moduleData.instructions) {
      const existingInstruction =
        await prisma.assignmentModuleInstruction.findFirst({
          where: {
            assignmentModuleId: assignmentModule.id,
            position: instructionData.position,
          },
          select: { id: true },
        });
      if (existingInstruction) {
        await prisma.assignmentModuleInstruction.update({
          where: { id: existingInstruction.id },
          data: instructionData,
        });
      } else {
        await prisma.assignmentModuleInstruction.create({
          data: {
            ...instructionData,
            assignmentModuleId: assignmentModule.id,
          },
        });
      }
    }
  }

  for (const entry of AP_HISTORY_LIBRARY_ENTRIES) {
    const promptLibraryEntry = await prisma.apHistoryPromptLibraryEntry.upsert({
      where: { externalKey: entry.externalKey },
      update: {
        assignmentTypeId: assignmentType.id,
        course: entry.course,
        essayType: entry.essayType,
        title: entry.title,
        prompt: entry.prompt,
        period: entry.period,
        periodNumber: entry.periodNumber,
        reasoningSkill: entry.reasoningSkill,
        difficulty: entry.difficulty,
        skillEmphasis: entry.skillEmphasis,
        defaultTimeMode: entry.defaultTimeMode,
        defaultDurationMinutes: entry.defaultDurationMinutes,
        provenanceUrl: entry.provenanceUrl,
        archivedAt: null,
      },
      create: {
        externalKey: entry.externalKey,
        assignmentTypeId: assignmentType.id,
        course: entry.course,
        essayType: entry.essayType,
        title: entry.title,
        prompt: entry.prompt,
        period: entry.period,
        periodNumber: entry.periodNumber,
        reasoningSkill: entry.reasoningSkill,
        difficulty: entry.difficulty,
        skillEmphasis: entry.skillEmphasis,
        defaultTimeMode: entry.defaultTimeMode,
        defaultDurationMinutes: entry.defaultDurationMinutes,
        provenanceUrl: entry.provenanceUrl,
      },
      select: { id: true },
    });

    for (const source of entry.sources) {
      await prisma.apHistoryPromptLibrarySource.upsert({
        where: { externalKey: source.externalKey },
        update: {
          promptLibraryEntryId: promptLibraryEntry.id,
          position: source.position,
          title: source.title,
          attribution: source.attribution,
          body: source.body,
          caption: source.caption,
          mediaType: source.mediaType,
          imageUrl: source.imageUrl,
          imageAlt: source.imageAlt,
          provenanceUrl: source.provenanceUrl,
          licenseName: source.licenseName,
          licenseUrl: source.licenseUrl,
        },
        create: {
          externalKey: source.externalKey,
          promptLibraryEntryId: promptLibraryEntry.id,
          position: source.position,
          title: source.title,
          attribution: source.attribution,
          body: source.body,
          caption: source.caption,
          mediaType: source.mediaType,
          imageUrl: source.imageUrl,
          imageAlt: source.imageAlt,
          provenanceUrl: source.provenanceUrl,
          licenseName: source.licenseName,
          licenseUrl: source.licenseUrl,
        },
      });
    }
  }

  console.log(`Seeded ${AP_HISTORY_LIBRARY_ENTRIES.length} AP History library entries.`);
}

seedApHistoryLibrary()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
