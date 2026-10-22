/** Read-only reporter tools the Lesson Planner may delegate to. */
export const LESSON_PLANNER_REPORTER_READONLY_TOOL_NAMES = [
  'list_classes',
  'get_class_grade_report',
  'find_students_needing_attention',
] as const;

export type LessonPlannerReporterReadOnlyToolName =
  (typeof LESSON_PLANNER_REPORTER_READONLY_TOOL_NAMES)[number];

const DELEGATION = Symbol('LessonPlannerReporterReadOnlyDelegation');

export type LessonPlannerReporterReadOnlyDelegation = {
  readonly [DELEGATION]: true;
};

/** Minted only from the Lesson Planner tool dispatcher — not from HTTP handlers. */
export function createLessonPlannerReporterReadOnlyDelegation(): LessonPlannerReporterReadOnlyDelegation {
  return { [DELEGATION]: true };
}

export function isLessonPlannerReporterReadOnlyDelegation(
  value: unknown
): value is LessonPlannerReporterReadOnlyDelegation {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as LessonPlannerReporterReadOnlyDelegation)[DELEGATION] === true
  );
}

export function isLessonPlannerReporterReadOnlyToolName(
  name: string
): name is LessonPlannerReporterReadOnlyToolName {
  return (LESSON_PLANNER_REPORTER_READONLY_TOOL_NAMES as readonly string[]).includes(
    name
  );
}
