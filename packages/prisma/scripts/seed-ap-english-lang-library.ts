/* eslint-disable no-console */
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { AP_ENGLISH_LANG_LIBRARY_ENTRIES } from './ap-english-lang-library-data';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  tutorInstructionSeedUpdate,
  withoutTutorInstructionFields,
} from './tutor-instructions-seed';
import { buildApEnglishLangCoachingBlock } from './ap-english-lang-coach-block';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY = 'ap_english_lang_essay';

/**
 * Course card art, in the same paper-and-ink language as the other courses.
 * The editable source sits beside it as ap-english-lang-course.svg.
 */
const COURSE_IMAGE_FILE = 'ap-english-lang-course.jpg';
const COURSE_IMAGE_CONTENT_TYPE = 'image/jpeg';
const COURSE_IMAGE_ALT_TEXT =
  'A stack of ruled pages titled AP English Language & Composition, the top one marked up with underlines and margin notes, a pen resting beside it.';

const ASSIGNMENT_TYPE_DATA = {
  title: 'AP English Language Essay',
  description:
    'Curated AP Lang synthesis, rhetorical analysis, and argument practice with 6-point rubric coaching.',
  position: 52,
} as const;

// The module's tutorInstructions are the coaching block: the Universal YAWP!
// Tutor Instructions plus the AP Lang posture, rubric, and register. Seeding
// them is what makes the tutor visible and editable in admin Tutor settings;
// the runtime prefers this stored value and appends the assignment-specific
// half (prompt, sources, timing) from the snapshot.
const MODULE_DATA = {
  title: 'AP English Language Essay',
  position: 1,
  description:
    'Write an AP Lang free-response essay with rubric-anchored coaching.',
  tutorInstructions: buildApEnglishLangCoachingBlock(),
};

const INSTRUCTION_DATA = {
  title: 'Write',
  prompt: 'Use the prompt and AP Language coach to draft your response.',
  position: 1,
  showChatButton: true,
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

async function seedApEnglishLangLibrary() {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!org) {
    throw new Error(
      'Cannot seed AP English Language library without an organization.'
    );
  }

  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY },
    update: {
      ...ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...ASSIGNMENT_TYPE_DATA,
      systemKey: AP_ENGLISH_LANG_ASSIGNMENT_TYPE_KEY,
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

  await upsertCourseImage(assignmentType.id);

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

  for (const entry of AP_ENGLISH_LANG_LIBRARY_ENTRIES) {
    const promptLibraryEntry =
      await prisma.apEnglishLangPromptLibraryEntry.upsert({
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
          suggestedEvidence: entry.suggestedEvidence,
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
          suggestedEvidence: entry.suggestedEvidence,
          provenanceUrl: entry.provenanceUrl,
        },
        select: { id: true },
      });

    for (const source of entry.sources) {
      await prisma.apEnglishLangPromptLibrarySource.upsert({
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
    `Seeded ${AP_ENGLISH_LANG_LIBRARY_ENTRIES.length} AP English Language library entries.`
  );
}

/**
 * Attach the course card art. Idempotent: re-running the seed refreshes the
 * blob rather than adding a second image (one per assignment type).
 */
async function upsertCourseImage(assignmentTypeId: string) {
  const assetPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    'assets',
    COURSE_IMAGE_FILE
  );

  let blob: Buffer;
  try {
    blob = await readFile(assetPath);
  } catch {
    // The art is a nicety; a missing asset must not fail the library seed.
    console.warn(`Course image ${COURSE_IMAGE_FILE} not found; skipping.`);
    return;
  }

  await prisma.assignmentTypeImage.upsert({
    where: { assignmentTypeId },
    create: {
      assignmentTypeId,
      contentType: COURSE_IMAGE_CONTENT_TYPE,
      altText: COURSE_IMAGE_ALT_TEXT,
      blob,
    },
    update: {
      contentType: COURSE_IMAGE_CONTENT_TYPE,
      altText: COURSE_IMAGE_ALT_TEXT,
      blob,
    },
  });
}

seedApEnglishLangLibrary()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
