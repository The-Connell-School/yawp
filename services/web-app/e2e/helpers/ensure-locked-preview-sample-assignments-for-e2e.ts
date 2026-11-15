import type { PrismaClient } from '@app/prisma';
import { defaultPointValueForNewAssignment } from '~/domain/assignments/new-assignment-defaults';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';
import { FREE_CLASSROOM_ASSIGNMENT_KINDS } from '~/domain/free-tier/free-classroom-assignment-kinds';

const PREVIEW_PREWRITING_PROMPT =
  'Pick one community garden in your town. List what you notice, who uses it, and one question you have about it.';
const PREVIEW_THESIS_PROMPT =
  'Draft one arguable thesis sentence about whether cities should require community gardens in new developments.';

/** Pending-class loader strips LOCKED_PREVIEW_SAMPLE_TITLES; use a distinct title. */
export async function createLockedPreviewBrowseAssignmentForE2E(
  prisma: PrismaClient,
  classId: string,
  title: string
) {
  const classStarterType = await prisma.assignmentType.findFirst({
    where: { kind: 'class_starter' },
    select: { id: true },
  });
  if (!classStarterType) {
    throw new Error('class_starter assignment type is missing from the E2E database');
  }
  return prisma.assignment.create({
    data: {
      assignmentTypeId: classStarterType.id,
      title,
      prompt: 'Write an opening line that pulls a reader into your topic.',
      submitForGrade: true,
      pointValue: defaultPointValueForNewAssignment({ kind: 'class_starter' }),
      gradingAssistantStrictnessLevel:
        DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
      classAssignments: { create: { classId } },
    },
    select: { id: true, title: true },
  });
}

/** Playwright-safe copy of ensureLockedPreviewSampleAssignments (no ~/utils/db.server). */
export async function ensureLockedPreviewSampleAssignmentsForE2E(
  prisma: PrismaClient,
  classId: string
) {
  const klass = await prisma.class.findUniqueOrThrow({
    where: { id: classId },
    select: { school: { select: { organizationId: true } } },
  });
  const organizationId = klass.school?.organizationId ?? null;

  const bundleTypes = await prisma.assignmentType.findMany({
    where: { kind: { in: [...FREE_CLASSROOM_ASSIGNMENT_KINDS] } },
    select: { id: true, kind: true },
  });
  if (organizationId) {
    for (const bundleType of bundleTypes) {
      await prisma.organizationAssignmentType.upsert({
        where: {
          organizationId_assignmentTypeId: {
            organizationId,
            assignmentTypeId: bundleType.id,
          },
        },
        create: {
          organizationId,
          assignmentTypeId: bundleType.id,
        },
        update: {},
      });
    }
  }
  const classStarterTypeId = bundleTypes.find((t) => t.kind === 'class_starter')
    ?.id;
  const prewritingTypeId = bundleTypes.find((t) => t.kind === 'prewriting')?.id;
  const thesisTypeId = bundleTypes.find((t) => t.kind === 'thesis_statement')
    ?.id;

  const samples: Array<{
    typeId: string | undefined;
    kind: string;
    title: string;
    prompt: string;
  }> = [
    {
      typeId: classStarterTypeId,
      kind: 'class_starter',
      title: 'Opening Lines',
      prompt: 'Write an opening line that pulls a reader into your topic.',
    },
    {
      typeId: prewritingTypeId,
      kind: 'prewriting',
      title: 'Community Gardens — Prewriting',
      prompt: PREVIEW_PREWRITING_PROMPT,
    },
    {
      typeId: thesisTypeId,
      kind: 'thesis_statement',
      title: 'Community Gardens — Thesis',
      prompt: PREVIEW_THESIS_PROMPT,
    },
  ];

  for (const sample of samples) {
    if (!sample.typeId) continue;
    const exists = await prisma.assignment.findFirst({
      where: {
        assignmentTypeId: sample.typeId,
        title: sample.title,
        classAssignments: { some: { classId } },
      },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.assignment.create({
      data: {
        assignmentTypeId: sample.typeId,
        title: sample.title,
        prompt: sample.prompt,
        submitForGrade: true,
        pointValue: defaultPointValueForNewAssignment({ kind: sample.kind }),
        gradingAssistantStrictnessLevel:
          DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
        classAssignments: { create: { classId } },
      },
    });
  }
}
