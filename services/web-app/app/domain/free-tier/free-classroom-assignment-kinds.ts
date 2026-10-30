/** Free-classroom assignment kinds + quotas — safe for client and server. */

export const FREE_CLASSROOM_ASSIGNMENT_QUOTAS = {
  class_starter: 12,
  prewriting: 3,
  thesis_statement: 3,
} as const;

export type FreeClassroomAssignmentQuotaKind =
  keyof typeof FREE_CLASSROOM_ASSIGNMENT_QUOTAS;

export const FREE_CLASSROOM_ASSIGNMENT_KINDS = Object.keys(
  FREE_CLASSROOM_ASSIGNMENT_QUOTAS
) as FreeClassroomAssignmentQuotaKind[];
