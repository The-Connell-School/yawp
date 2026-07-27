/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { AP_HISTORY_LIBRARY_ENTRIES } from './ap-history-library-data';
import { AP_HISTORY_SEED_MODULES } from './ap-history-module-data';
import {
  tutorInstructionSeedUpdate,
  withoutTutorInstructionFields,
} from './tutor-instructions-seed';
import { UNIVERSAL_TUTOR_BLOCK } from './universal-tutor-block';
import { isLocalDatabaseUrl } from './seed-overlay-connection';

const AP_HISTORY_ASSIGNMENT_TYPE_KEY = 'ap_history_essay';

const ASSIGNMENT_TYPE_DATA = {
  title: 'AP History Essay',
  description:
    'Curated AP U.S., European, and World History DBQ and LEQ practice with AP rubric coaching.',
  position: 50,
} as const;

// The assignment-level General Tutor Instructions. Every YAWP! Tutor starts
// here, which is why it is the universal block verbatim.
const ASSIGNMENT_TYPE_TUTOR_INSTRUCTIONS = {
  tutorInstructions: UNIVERSAL_TUTOR_BLOCK,
};

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

  const existingAssignmentType = await prisma.assignmentType.findUnique({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    select: { tutorInstructions: true },
  });

  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: AP_HISTORY_ASSIGNMENT_TYPE_KEY },
    update: {
      ...ASSIGNMENT_TYPE_DATA,
      // Only fills the General Tutor Instructions box when it is still empty,
      // so an admin's edit survives the next deploy.
      ...tutorInstructionSeedUpdate(
        ASSIGNMENT_TYPE_TUTOR_INSTRUCTIONS,
        existingAssignmentType ?? {}
      ),
      archivedAt: null,
    },
    create: {
      ...ASSIGNMENT_TYPE_DATA,
      ...ASSIGNMENT_TYPE_TUTOR_INSTRUCTIONS,
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
          tutorInstructionsVariantsJson: moduleData.tutorInstructionsVariantsJson,
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

  // Upsert each section (module) by position. Position 1 upgrades the legacy
  // single "AP History Essay" module in place so existing documents keep
  // their sessions; positions 2-4 are additive and their sessions are
  // created on demand when a student advances into them.
  for (const moduleData of AP_HISTORY_SEED_MODULES) {
    const moduleFields = {
      title: moduleData.title,
      position: moduleData.position,
      description: moduleData.description,
      tutorInstructions: moduleData.tutorInstructions,
      tutorInstructionsVariantsJson: moduleData.tutorInstructionsVariantsJson,
    };

    const existingModule = await prisma.assignmentModule.findFirst({
      where: {
        assignmentTypeId: assignmentType.id,
        position: moduleData.position,
        deletedAt: null,
      },
      select: {
        id: true,
        tutorInstructions: true,
        tutorInstructionsVariantsJson: true,
      },
    });

    const module = existingModule
      ? await prisma.assignmentModule.update({
          where: { id: existingModule.id },
          // Structural fields are always refreshed; tutor guidance is only
          // written where admin has not put anything of its own.
          data: {
            ...withoutTutorInstructionFields(moduleFields),
            ...tutorInstructionSeedUpdate(moduleFields, existingModule),
          },
          select: { id: true },
        })
      : await prisma.assignmentModule.create({
          data: {
            ...moduleFields,
            assignmentTypeId: assignmentType.id,
          },
          select: { id: true },
        });

    for (const instructionData of moduleData.instructions) {
      const existingInstruction =
        await prisma.assignmentModuleInstruction.findFirst({
          where: {
            assignmentModuleId: module.id,
            position: instructionData.position,
          },
          select: {
            id: true,
            tutorInstructions: true,
            tutorInstructionsVariantsJson: true,
          },
        });

      if (existingInstruction) {
        await prisma.assignmentModuleInstruction.update({
          where: { id: existingInstruction.id },
          data: {
            ...withoutTutorInstructionFields(instructionData),
            ...tutorInstructionSeedUpdate(instructionData, existingInstruction),
          },
        });
      } else {
        await prisma.assignmentModuleInstruction.create({
          data: {
            ...instructionData,
            assignmentModuleId: module.id,
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
