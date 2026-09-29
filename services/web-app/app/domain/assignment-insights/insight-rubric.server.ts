import { resolveAssignmentTypeGradingConfig } from '~/domain/assignment-types/assignment-type-grading-config.server';
import { applyAssignmentGrammarGrading } from '~/domain/assignment-types/assignment-grammar-grading';
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
          id: true,
          assignmentTypeId: true,
          grammarGradingEnabled: true,
          assignmentType: { select: { kind: true, title: true } },
        },
      },
    },
  });

  const assignmentTypeId = classAssignment?.assignment?.assignmentTypeId;
  if (!assignmentTypeId) return DEFAULT_INSIGHT_RUBRIC;

  const config = await resolveAssignmentTypeGradingConfig({
    assignmentTypeId,
    assignmentId: classAssignment.assignment.id,
    assignmentTypeKind: classAssignment.assignment.assignmentType?.kind ?? null,
    assignmentTypeTitle:
      classAssignment.assignment.assignmentType?.title ?? null,
  });

  if (config.rubricCategories.length === 0) return DEFAULT_INSIGHT_RUBRIC;

  // The teacher's grammar toggle, applied the way grading applies it: with
  // grammar off the category was never scored, so it is not a category the
  // class did badly in.
  const categories = applyAssignmentGrammarGrading(
    config.rubricCategories,
    classAssignment.assignment.grammarGradingEnabled
  );

  return insightRubricFromCategories({
    categories,
    minScore: config.minScore,
    maxScore: config.maxScore,
  });
}
