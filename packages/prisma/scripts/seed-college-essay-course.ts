/* eslint-disable no-console */
/**
 * Seeds the "College Admissions Essay" system course (The Object & Two-Traits
 * method). Idempotent: safe to re-run. Mirrors seed-ap-history-library.ts.
 *
 * Run standalone against any environment's database:
 *   bun run scripts/seed-college-essay-course.ts
 *
 * Or call `seedCollegeEssayCourse(prisma)` from another seed pipeline (it is
 * wired into the local-dev / preview seed so the course appears automatically).
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PrismaClient } from '../generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { isLocalDatabaseUrl } from './seed-overlay-connection';
import {
  tutorInstructionSeedUpdate,
  withoutTutorInstructionFields,
} from './tutor-instructions-seed';
import {
  COLLEGE_ESSAY_ASSIGNMENT_TYPE,
  COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY,
  COLLEGE_ESSAY_CALIBRATION_NOTES,
  COLLEGE_ESSAY_GRADING_INSTRUCTIONS,
  COLLEGE_ESSAY_MODULES,
  COLLEGE_ESSAY_OUTPUT_SCHEMA,
  COLLEGE_ESSAY_RUBRIC_CATEGORIES,
  COLLEGE_ESSAY_SCORING_SCALE,
  imageContentTypeForPath,
  type CourseModule,
} from './college-essay-course-data';

const ASSIGNMENT_TYPE_DATA = {
  title: COLLEGE_ESSAY_ASSIGNMENT_TYPE.title,
  description: COLLEGE_ESSAY_ASSIGNMENT_TYPE.description,
  position: COLLEGE_ESSAY_ASSIGNMENT_TYPE.position,
  scoringScaleJson: COLLEGE_ESSAY_SCORING_SCALE,
  rubricJson: {
    categories: COLLEGE_ESSAY_RUBRIC_CATEGORIES.map((category) => ({
      key: category.key,
      label: category.label,
      weight: category.weight,
      description: category.description,
    })),
  },
  gradingPromptConfigJson: {
    gradingInstructions: COLLEGE_ESSAY_GRADING_INSTRUCTIONS,
  },
  gradingOutputSchemaJson: COLLEGE_ESSAY_OUTPUT_SCHEMA,
  gradingCalibrationNotes: COLLEGE_ESSAY_CALIBRATION_NOTES,
} as const;

/** Candidate course-image filenames, checked in order (first match wins). */
const COURSE_IMAGE_BASENAMES = [
  'college-essay-course.png',
  'college-essay-course.jpg',
  'college-essay-course.jpeg',
  'college-essay-course.webp',
];

/** Resolves the committed course-image asset, if one has been added. */
function resolveCourseImageAsset(): { path: string; contentType: string } | null {
  const assetsDir = join(
    dirname(fileURLToPath(import.meta.url)),
    'assets'
  );
  for (const basename of COURSE_IMAGE_BASENAMES) {
    const path = join(assetsDir, basename);
    if (!existsSync(path)) continue;
    const contentType = imageContentTypeForPath(path);
    if (contentType) return { path, contentType };
  }
  return null;
}

/**
 * Sets the course header image from the committed asset, if present. No-ops
 * when no asset file has been added yet, so the seed stays safe to run.
 */
async function upsertCourseImage(
  prisma: PrismaClient,
  assignmentTypeId: string
) {
  const asset = resolveCourseImageAsset();
  if (!asset) return;

  const blob = readFileSync(asset.path);
  await prisma.assignmentTypeImage.deleteMany({ where: { assignmentTypeId } });
  await prisma.assignmentTypeImage.create({
    data: {
      assignmentTypeId,
      contentType: asset.contentType,
      altText: 'College Admissions Essay course',
      blob,
    },
  });
}

async function upsertModule(
  prisma: PrismaClient,
  assignmentTypeId: string,
  moduleData: CourseModule
) {
  const moduleFields = {
    title: moduleData.title,
    position: moduleData.position,
    description: moduleData.description,
    tutorInstructions: moduleData.tutorInstructions,
    isSelfGuided: moduleData.isSelfGuided ?? false,
  };

  const existing = await prisma.assignmentModule.findFirst({
    where: { assignmentTypeId, position: moduleData.position },
    select: { id: true, tutorInstructions: true },
  });

  const module = existing
    ? await prisma.assignmentModule.update({
        where: { id: existing.id },
        // Structural fields are refreshed every run; the tutor instructions
        // are only written when admin has not put anything there, so a
        // re-seed on deploy cannot revert somebody's edit.
        data: {
          ...withoutTutorInstructionFields(moduleFields),
          ...tutorInstructionSeedUpdate(moduleFields, existing),
          deletedAt: null,
        },
        select: { id: true },
      })
    : await prisma.assignmentModule.create({
        data: { ...moduleFields, assignmentTypeId },
        select: { id: true },
      });

  for (const instruction of moduleData.instructions) {
    const instructionFields = {
      position: instruction.position,
      title: instruction.title,
      prompt: instruction.prompt,
      tutorInstructions: instruction.tutorInstructions ?? null,
      showChatButton: instruction.showChatButton ?? false,
      showNextButton: instruction.showNextButton ?? true,
    };

    const existingInstruction =
      await prisma.assignmentModuleInstruction.findFirst({
        where: { assignmentModuleId: module.id, position: instruction.position },
        select: { id: true, tutorInstructions: true },
      });

    const instructionId = existingInstruction
      ? (
          await prisma.assignmentModuleInstruction.update({
            where: { id: existingInstruction.id },
            data: {
              ...withoutTutorInstructionFields(instructionFields),
              ...tutorInstructionSeedUpdate(
                instructionFields,
                existingInstruction
              ),
            },
            select: { id: true },
          })
        ).id
      : (
          await prisma.assignmentModuleInstruction.create({
            data: { ...instructionFields, assignmentModuleId: module.id },
            select: { id: true },
          })
        ).id;

    // Buttons have no natural unique key; rewrite them for a clean idempotent state.
    await prisma.assignmentModuleInstructionButton.deleteMany({
      where: { assignmentModuleInstructionId: instructionId },
    });
    if (instruction.buttons?.length) {
      await prisma.assignmentModuleInstructionButton.createMany({
        data: instruction.buttons.map((button) => ({
          assignmentModuleInstructionId: instructionId,
          position: button.position,
          label: button.label,
          action: button.action,
        })),
      });
    }
  }

  return module.id;
}

export async function seedCollegeEssayCourse(prisma: PrismaClient) {
  const org = await prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });

  if (!org) {
    throw new Error(
      'Cannot seed the College Admissions Essay course without an organization.'
    );
  }

  const assignmentType = await prisma.assignmentType.upsert({
    where: { systemKey: COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY },
    update: {
      ...ASSIGNMENT_TYPE_DATA,
      archivedAt: null,
    },
    create: {
      ...ASSIGNMENT_TYPE_DATA,
      systemKey: COLLEGE_ESSAY_ASSIGNMENT_TYPE_KEY,
      ownerOrgId: org.id,
      organizationAssignments: {
        create: { organizationId: org.id },
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

  await upsertCourseImage(prisma, assignmentType.id);

  for (const moduleData of COLLEGE_ESSAY_MODULES) {
    await upsertModule(prisma, assignmentType.id, moduleData);
  }

  console.log(
    `Seeded College Admissions Essay course with ${COLLEGE_ESSAY_MODULES.length} modules.`
  );
}

function createStandalonePrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const getSchemaFromDatabaseUrl = (url: string): string | undefined => {
    const match = url.match(/[?&]schema=([^&]+)/i);
    if (!match) return undefined;
    return decodeURIComponent(match[1]);
  };

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

  return new PrismaClient({ adapter });
}

// Only run the standalone CLI path when executed directly, so importing the
// `seedCollegeEssayCourse` function from another seed pipeline does not connect.
if (import.meta.main) {
  const prisma = createStandalonePrismaClient();
  seedCollegeEssayCourse(prisma)
    .catch((error) => {
      console.error(error);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
