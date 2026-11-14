/** Free-classroom assignment kinds + quotas — safe for client and server. */

export const FREE_CLASSROOM_ASSIGNMENT_QUOTAS = {
  class_starter: 12,
  exit_ticket: 3,
  five_paragraph_essay: 3,
  prewriting: 3,
  thesis_statement: 3,
} as const;

export type FreeClassroomAssignmentQuotaKind =
  keyof typeof FREE_CLASSROOM_ASSIGNMENT_QUOTAS;

/** Brian (Nov 13, 2026): carousel and picker order for the free-classroom bundle. */
export const FREE_CLASSROOM_BUNDLE_KIND_ORDER = [
  'class_starter',
  'exit_ticket',
  'five_paragraph_essay',
  'prewriting',
  'thesis_statement',
] as const satisfies readonly FreeClassroomAssignmentQuotaKind[];

export const FREE_CLASSROOM_ASSIGNMENT_KINDS = [
  ...FREE_CLASSROOM_BUNDLE_KIND_ORDER,
] as FreeClassroomAssignmentQuotaKind[];
