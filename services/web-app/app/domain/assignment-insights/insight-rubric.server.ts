import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { prisma } from '~/utils/db.server';
import {
  DEFAULT_INSIGHT_RUBRIC,
  insightRubricFromCategories,
  type InsightRubric,
} from './insight-rubric';

/**
 * The rubric one class assignment was graded on.
 *
 * Resolved through the same path the grading assistant uses, so the categories
 * a summary aggregates are by construction the categories scores were written
 * under. Anything else and the two drift apart silently — which is exactly what
 * had happened.
 *
 * Falls back to the default rubric rather than failing: a class summary is
 * worth having even for an assignment type whose rubric cannot be resolved, and
 * the default is what those submissions were graded against anyway.
 */
export async function readInsightRubric({
  classAssignmentId,
}: {
  classAssignmentId: string;
}): Promise<InsightRubric> {
  const classAssignment = await prisma.classAssignment.findUnique({
    where: { id: classAssignmentId },
    select: {
      assignment: {
        select: {
          assignmentTypeId: true,
          assignmentType: { select: { kind: true, title: true } },
        },
      },
    },
  });

  const assignmentTypeId = classAssignment?.assignment?.assignmentTypeId;
  if (!assignmentTypeId) return DEFAULT_INSIGHT_RUBRIC;

  const config = await resolveAssignmentTypeGradingConfig({
    assignmentTypeId,
    assignmentTypeKind: classAssignment.assignment.assignmentType?.kind ?? null,
    assignmentTypeTitle:
      classAssignment.assignment.assignmentType?.title ?? null,
  });

  if (config.rubricCategories.length === 0) return DEFAULT_INSIGHT_RUBRIC;

  return insightRubricFromCategories({
    categories: config.rubricCategories,
    minScore: config.minScore,
    maxScore: config.maxScore,
  });
}
