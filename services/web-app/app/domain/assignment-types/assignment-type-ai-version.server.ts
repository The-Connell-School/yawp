type AssignmentTypeAiButtonInput = {
  id: string;
  position: number;
  label: string;
  action: string;
};

type AssignmentTypeAiInstructionInput = {
  id: string;
  position: number;
  title: string;
  prompt: string;
  tutorInstructions: string | null;
  showChatButton: boolean | null;
  showNextButton: boolean | null;
  buttons?: AssignmentTypeAiButtonInput[] | null;
};

type AssignmentTypeAiModuleInput = {
  id: string;
  title: string;
  position: number;
  description: string | null;
  tutorInstructions: string | null;
  isSelfGuided: boolean;
  rubricAlignmentJson: unknown;
  instructions?: AssignmentTypeAiInstructionInput[] | null;
};

type AssignmentTypeAiSnapshotInput = {
  id: string;
  title: string;
  kind: string | null;
  description: string | null;
  scoringScaleJson: unknown;
  rubricJson: unknown;
  gradingPromptConfigJson: unknown;
  gradingOutputSchemaJson: unknown;
  gradingCalibrationNotes: string | null;
  gradingAssistantVersion: number;
  gradingAssistantSourceTemplateId: string | null;
  gradingAssistantSourceTemplateSlug: string | null;
  assignmentModules?: AssignmentTypeAiModuleInput[] | null;
};

export type AssignmentTypeAiSnapshot = {
  schemaVersion: 1;
  assignmentType: {
    id: string;
    title: string;
    kind: string | null;
    description: string | null;
    gradingAssistantVersion: number;
    scoringScaleJson: unknown;
    rubricJson: unknown;
    gradingPromptConfigJson: unknown;
    gradingOutputSchemaJson: unknown;
    gradingCalibrationNotes: string | null;
    gradingAssistantSourceTemplateId: string | null;
    gradingAssistantSourceTemplateSlug: string | null;
  };
  modules: Array<{
    id: string;
    title: string;
    position: number;
    description: string | null;
    tutorInstructions: string | null;
    isSelfGuided: boolean;
    rubricAlignmentJson: unknown;
    instructions: Array<{
      id: string;
      position: number;
      title: string;
      prompt: string;
      tutorInstructions: string | null;
      showChatButton: boolean | null;
      showNextButton: boolean | null;
      buttons: AssignmentTypeAiButtonInput[];
    }>;
  }>;
};

function byPositionThenId<T extends { position: number; id: string }>(
  left: T,
  right: T
) {
  if (left.position !== right.position) return left.position - right.position;
  return left.id.localeCompare(right.id);
}

export function buildAssignmentTypeAiSnapshot({
  assignmentType,
}: {
  assignmentType: AssignmentTypeAiSnapshotInput;
}): AssignmentTypeAiSnapshot {
  const modules = [...(assignmentType.assignmentModules ?? [])]
    .sort(byPositionThenId)
    .map((module) => ({
      id: module.id,
      title: module.title,
      position: module.position,
      description: module.description ?? null,
      tutorInstructions: module.tutorInstructions ?? null,
      isSelfGuided: module.isSelfGuided,
      rubricAlignmentJson: module.rubricAlignmentJson ?? null,
      instructions: [...(module.instructions ?? [])]
        .sort(byPositionThenId)
        .map((instruction) => ({
          id: instruction.id,
          position: instruction.position,
          title: instruction.title,
          prompt: instruction.prompt,
          tutorInstructions: instruction.tutorInstructions ?? null,
          showChatButton: instruction.showChatButton ?? null,
          showNextButton: instruction.showNextButton ?? null,
          buttons: [...(instruction.buttons ?? [])].sort(byPositionThenId).map(
            (button) => ({
              id: button.id,
              position: button.position,
              label: button.label,
              action: button.action,
            })
          ),
        })),
    }));

  return {
    schemaVersion: 1,
    assignmentType: {
      id: assignmentType.id,
      title: assignmentType.title,
      kind: assignmentType.kind ?? null,
      description: assignmentType.description ?? null,
      gradingAssistantVersion: assignmentType.gradingAssistantVersion,
      scoringScaleJson: assignmentType.scoringScaleJson ?? null,
      rubricJson: assignmentType.rubricJson ?? null,
      gradingPromptConfigJson: assignmentType.gradingPromptConfigJson ?? null,
      gradingOutputSchemaJson: assignmentType.gradingOutputSchemaJson ?? null,
      gradingCalibrationNotes: assignmentType.gradingCalibrationNotes ?? null,
      gradingAssistantSourceTemplateId:
        assignmentType.gradingAssistantSourceTemplateId ?? null,
      gradingAssistantSourceTemplateSlug:
        assignmentType.gradingAssistantSourceTemplateSlug ?? null,
    },
    modules,
  };
}

export async function recordAssignmentTypeAiVersion({
  assignmentTypeId,
  changeSource,
  changeSummary,
  createdByUserId = null,
  tx,
}: {
  assignmentTypeId: string;
  changeSource: string;
  changeSummary: string;
  createdByUserId?: string | null;
  tx?: any;
}) {
  const db = tx ?? (await import('~/utils/db.server')).prisma;
  const assignmentType = await db.assignmentType.findUnique({
    where: { id: assignmentTypeId },
    include: {
      assignmentModules: {
        where: { deletedAt: null },
        orderBy: [{ position: 'asc' }, { id: 'asc' }],
        include: {
          instructions: {
            orderBy: [{ position: 'asc' }, { id: 'asc' }],
            include: {
              buttons: {
                orderBy: [{ position: 'asc' }, { id: 'asc' }],
              },
            },
          },
        },
      },
    },
  });

  if (!assignmentType) {
    throw new Response('Assignment type not found', { status: 404 });
  }

  const latest = await db.assignmentTypeAiVersion.aggregate({
    where: { assignmentTypeId },
    _max: { versionNumber: true },
  });
  const versionNumber = (latest._max.versionNumber ?? 0) + 1;
  const snapshot = buildAssignmentTypeAiSnapshot({ assignmentType });

  return db.assignmentTypeAiVersion.create({
    data: {
      assignmentTypeId,
      versionNumber,
      changeSource,
      changeSummary,
      createdByUserId,
      snapshotJson: snapshot,
    },
  });
}
