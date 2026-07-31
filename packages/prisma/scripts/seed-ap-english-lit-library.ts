/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { AP_ENGLISH_LIT_LIBRARY_ENTRIES } from './ap-english-lit-library-data';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  tutorInstructionSeedUpdate,
  withoutTutorInstructionFields,
} from './tutor-instructions-seed';
import {
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_DATA as ASSIGNMENT_TYPE_DATA,
  AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
  AP_ENGLISH_LIT_INSTRUCTION_DATA as INSTRUCTION_DATA,
  AP_ENGLISH_LIT_MODULE_DATA as MODULE_DATA,
} from './ap-english-lit-course-data';

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

async function seedApEnglishLitLibrary() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!org) {
    throw new Error(
      'Cannot seed AP English Literature library without an organization.'
    );
  }

  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY },
    update: {
      ...ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...ASSIGNMENT_TYPE_DATA,
      systemKey: AP_ENGLISH_LIT_ASSIGNMENT_TYPE_KEY,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
      },
      assignmentModules: {
        create: {
          ...MODULE_DATA,
          instructions: {
            create: INSTRUCTION_DATA,
          },
        },
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

  const existingModule = await prisma.assignmentModule.findFirst({
    where: {
      assignmentTypeId: assignmentType.id,
      position: MODULE_DATA.position,
    },
    select: { id: true, tutorInstructions: true },
  });

  const module = existingModule
    ? await prisma.assignmentModule.update({
        where: { id: existingModule.id },
        // Structural fields refresh every run; the coaching block is only
        // written when admin has not put anything there, so a re-seed on
        // deploy cannot revert an edit.
        data: {
          ...withoutTutorInstructionFields(MODULE_DATA),
          ...tutorInstructionSeedUpdate(MODULE_DATA, existingModule),
        },
        select: { id: true },
      })
    : await prisma.assignmentModule.create({
        data: {
          ...MODULE_DATA,
          assignmentTypeId: assignmentType.id,
        },
        select: { id: true },
      });

  const existingInstruction = await prisma.assignmentModuleInstruction.findFirst(
    {
      where: {
        assignmentModuleId: module.id,
        position: INSTRUCTION_DATA.position,
      },
      select: { id: true },
    }
  );

  if (existingInstruction) {
    await prisma.assignmentModuleInstruction.update({
      where: { id: existingInstruction.id },
      data: INSTRUCTION_DATA,
    });
  } else {
    await prisma.assignmentModuleInstruction.create({
      data: {
        ...INSTRUCTION_DATA,
        assignmentModuleId: module.id,
      },
    });
  }

  for (const entry of AP_ENGLISH_LIT_LIBRARY_ENTRIES) {
    const promptLibraryEntry =
      await prisma.apEnglishLitPromptLibraryEntry.upsert({
        where: { externalKey: entry.externalKey },
        update: {
          assignmentTypeId: assignmentType.id,
          frqType: entry.frqType,
          title: entry.title,
          prompt: entry.prompt,
          focusSkill: entry.focusSkill,
          difficulty: entry.difficulty,
          skillEmphasis: entry.skillEmphasis,
          defaultTimeMode: entry.defaultTimeMode,
          defaultDurationMinutes: entry.defaultDurationMinutes,
          suggestedWorks: entry.suggestedWorks,
          provenanceUrl: entry.provenanceUrl,
          archivedAt: null,
        },
        create: {
          externalKey: entry.externalKey,
          assignmentTypeId: assignmentType.id,
          frqType: entry.frqType,
          title: entry.title,
          prompt: entry.prompt,
          focusSkill: entry.focusSkill,
          difficulty: entry.difficulty,
          skillEmphasis: entry.skillEmphasis,
          defaultTimeMode: entry.defaultTimeMode,
          defaultDurationMinutes: entry.defaultDurationMinutes,
          suggestedWorks: entry.suggestedWorks,
          provenanceUrl: entry.provenanceUrl,
        },
        select: { id: true },
      });

    for (const source of entry.sources) {
      await prisma.apEnglishLitPromptLibrarySource.upsert({
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

  console.log(
    `Seeded ${AP_ENGLISH_LIT_LIBRARY_ENTRIES.length} AP English Literature library entries.`
  );
}

seedApEnglishLitLibrary()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
