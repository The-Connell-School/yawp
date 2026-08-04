/**
 * Tool layer for the YAWP! Lesson Planner.
 *
 * The planner does not need its own data access: the reporter already exposes
 * teacher-scoped, read-only class reports anchored to the caller's membership
 * and organization. We reuse those definitions through a strict allowlist so
 * the planner can ground a lesson in how the class actually performed while
 * remaining unable to write anything or to reach a single student's essay.
 */
import {
  handleReporterToolCall,
  REPORTER_TOOLS,
  type ReporterTool,
} from '~/domain/reporter/reporter-tools.server';

export type LessonPlannerToolContext = {
  /** The calling teacher's OrgMembership id. */
  membershipId: string;
  /** The calling teacher's organization id. */
  organizationId: string;
};

/**
 * The only tools the planner may call. Read-only and class-level: enough to
 * see which classes exist, how each did against the rubric, and who is
 * struggling enough to need a differentiated path through the lesson.
 */
export const LESSON_PLANNER_TOOL_NAMES = [
  'list_classes',
  'get_class_grade_report',
  'find_students_needing_attention',
] as const;

const allowed = new Set<string>(LESSON_PLANNER_TOOL_NAMES);

/** Allowlist order is preserved so the model always sees list_classes first. */
export const LESSON_PLANNER_TOOLS: ReporterTool[] =
  LESSON_PLANNER_TOOL_NAMES.map((name) =>
    REPORTER_TOOLS.find((tool) => tool.name === name)
  ).filter((tool): tool is ReporterTool => Boolean(tool));

export async function handleLessonPlannerToolCall(
  name: string,
  input: Record<string, unknown>,
  ctx: LessonPlannerToolContext
): Promise<string> {
  if (!allowed.has(name)) {
    return JSON.stringify({
      error: `Unknown tool: ${name}. The lesson planner can only read class-level reports.`,
    });
  }
  // Rebuild the context explicitly: the reporter handler stages writes into a
  // caller-supplied buffer, and the planner must never hand it one.
  return handleReporterToolCall(name, input, {
    membershipId: ctx.membershipId,
    organizationId: ctx.organizationId,
  });
}
