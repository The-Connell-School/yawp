import { CLASS_STARTER_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/class-starter-rubric';
import { DAILY_PAGES_ASSIGNMENT_TYPE_KIND } from '~/domain/assignment-types/daily-pages-rubric';
import {
  EXIT_TICKET_ASSIGNMENT_TYPE_KIND,
  EXIT_TICKET_DEFAULT_POINT_VALUE,
  isExitTicketAssignmentType,
} from '~/domain/assignment-types/exit-ticket';
import { assignmentTypeUsesDailyPagesEngagementRubric } from '~/domain/assignment-types/daily-pages-engagement-rubric';
import { DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE } from '~/domain/assignments/saved-assignments';

/** PKG-03: Brian walkthrough Oct 26 — Class Starter opens at 10 points. */
export const CLASS_STARTER_DEFAULT_POINT_VALUE = 10;

/** PKG-03: Daily Pages (and engagement-rubric variants) open at 20 points. */
export const DAILY_PAGES_DEFAULT_POINT_VALUE = 20;

export type AssignmentTypeDefaultContext = {
  kind?: string | null;
  rubricName?: string | null;
};

export function defaultPointValueForNewAssignment(
  context: AssignmentTypeDefaultContext
): number {
  if (isExitTicketAssignmentType({ kind: context.kind ?? null })) {
    return EXIT_TICKET_DEFAULT_POINT_VALUE;
  }
  if (context.kind === CLASS_STARTER_ASSIGNMENT_TYPE_KIND) {
    return CLASS_STARTER_DEFAULT_POINT_VALUE;
  }
  if (
    assignmentTypeUsesDailyPagesEngagementRubric({
      kind: context.kind ?? null,
      rubricName: context.rubricName ?? null,
    })
  ) {
    return DAILY_PAGES_DEFAULT_POINT_VALUE;
  }
  return DEFAULT_SAVED_ASSIGNMENT_POINT_VALUE;
}

/**
 * When creating a new assignment, use the type default unless the caller
 * supplied an explicit point value (edit, reuse, or lesson-planner plan).
 */
export function resolveNewAssignmentPointValue(params: {
  isEditing: boolean;
  explicitPointValue: number | null | undefined;
  assignmentType: AssignmentTypeDefaultContext;
}): number | null | undefined {
  if (params.isEditing) {
    return params.explicitPointValue;
  }
  if (params.explicitPointValue !== undefined) {
    return params.explicitPointValue;
  }
  return defaultPointValueForNewAssignment(params.assignmentType);
}
