import type { PrismaClient } from '@app/prisma';
import {
  parseAssignmentTypeRubricConfig,
  type AssignmentTypeRubricConfigInput,
} from './assignment-type-rubric-config';
import type { RubricData, ScoringScaleData } from './assignment-type-rubric.shared';

export type RubricCopySource = {
  id: string;
  title: string;
  categoryCount: number;
  scoringScale: ScoringScaleData;
  rubric: RubricData;
};

type AssignmentTypeRubricRow = AssignmentTypeRubricConfigInput & {
  id: string;
  title: string;
};

export function isCopyableRubric(rubric: RubricData): boolean {
  return rubric.categories.some((category) => category.label.trim().length > 0);
}

export async function listCopyableRubricSources(
  prisma: PrismaClient,
  options: { excludeAssignmentTypeId?: string | null } = {}
): Promise<RubricCopySource[]> {
  const assignmentTypes = (await prisma.assignmentType.findMany({
    where: {
      archivedAt: null,
      ...(options.excludeAssignmentTypeId
        ? { id: { not: options.excludeAssignmentTypeId } }
        : {}),
    },
    orderBy: { title: 'asc' },
  })) as AssignmentTypeRubricRow[];

  return assignmentTypes.flatMap((assignmentType) => {
    const config = parseAssignmentTypeRubricConfig({
      scoringScaleJson: assignmentType.scoringScaleJson,
      rubricJson: assignmentType.rubricJson,
      gradingPromptConfigJson: assignmentType.gradingPromptConfigJson,
      gradingOutputSchemaJson: assignmentType.gradingOutputSchemaJson,
      gradingCalibrationNotes: assignmentType.gradingCalibrationNotes,
    });

    if (config.source !== 'assignment-type') {
      return [];
    }

    if (!isCopyableRubric(config.rubric)) {
      return [];
    }

    return [
      {
        id: assignmentType.id,
        title: assignmentType.title,
        categoryCount: config.rubric.categories.length,
        scoringScale: config.scoringScale,
        rubric: config.rubric,
      },
    ];
  });
}
