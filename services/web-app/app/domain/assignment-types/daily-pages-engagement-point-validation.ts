import {
  assignmentTypeUsesDailyPagesEngagementRubric,
  MIN_DAILY_PAGES_ENGAGEMENT_POINT_TOTAL,
} from './daily-pages-engagement-rubric';

export function dailyPagesEngagementPointValueError({
  kind,
  rubricName,
  outputSchema,
  pointValue,
}: {
  kind?: string | null;
  rubricName?: string | null;
  outputSchema?: Record<string, unknown> | null;
  pointValue: number;
}): string | null {
  if (
    !assignmentTypeUsesDailyPagesEngagementRubric({
      kind,
      rubricName,
      outputSchema,
    })
  ) {
    return null;
  }
  if (pointValue < MIN_DAILY_PAGES_ENGAGEMENT_POINT_TOTAL) {
    return `Point value must be at least ${MIN_DAILY_PAGES_ENGAGEMENT_POINT_TOTAL} for Daily Pages engagement grading.`;
  }
  return null;
}
