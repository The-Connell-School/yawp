import { prisma } from '~/utils/db.server';
import { FREE_CLASSROOM_ASSIGNMENT_KINDS } from '~/utils/entitlements.server';
import { defaultPointValueForNewAssignment } from '~/domain/assignments/new-assignment-defaults';
import { DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL } from '~/domain/grading/grading-assistant-strictness';

/**
 * Grading fields for a browse-only sample. Without them the row falls back to
 * the column default of 100 points, so the sample Class Starter would preview
 * at 100 instead of the 10 a teacher gets when creating one (PKG-03 / #855).
 */
export function lockedPreviewSampleGradingDefaults(kind: string | null) {
  return {
    submitForGrade: true,
    pointValue: defaultPointValueForNewAssignment({ kind }),
    gradingAssistantStrictnessLevel: DEFAULT_GRADING_ASSISTANT_STRICTNESS_LEVEL,
  };
}

const PREVIEW_PREWRITING_PROMPT =
  'Pick one community garden in your town. List what you notice, who uses it, and one question you have about it.';
const PREVIEW_THESIS_PROMPT =
  'Draft one arguable thesis sentence about whether cities should require community gardens in new developments.';

/** Browse-only sample assignments for pending teachers (not sent). */
export async function ensureLockedPreviewSampleAssignments(
  organizationId: string,
  classId: string
) {
  const bundleTypes = await prisma.assignmentType.findMany({
    where: { kind: { in: [...FREE_CLASSROOM_ASSIGNMENT_KINDS] } },
    select: { id: true, kind: true },
  });
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
  }> =
    [
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
        ...lockedPreviewSampleGradingDefaults(sample.kind),
        classAssignments: { create: { classId } },
      },
    });
  }
}
