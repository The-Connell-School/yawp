import type { Organization, OrganizationPlan } from '@app/prisma';

// Spec §5.3: one primitive — Organization.plan — decides entitlements.
// Default SCHOOL plan must short-circuit every check to preserve current behavior.

export const FREE_CLASSROOM_STUDENT_SEAT_CAP = 35;
export const FREE_CLASSROOM_TEACHER_SEAT_CAP = 1;
export const FREE_CLASSROOM_ACTIVE_CLASS_CAP = 1;
export const FREE_CLASSROOM_LESSON_PLAN_QUOTA = 5;

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

export type PlanEntitlements = {
  plan: OrganizationPlan;
  // null represents "unlimited / defer to existing behavior"
  studentSeatCap: number | null;
  teacherSeatCap: number | null;
  activeClassCap: number | null;
  features: {
    reporter: boolean;
    classInsights: boolean;
    lessonPlanQuota: number | null;
  };
  // Predicates (must short-circuit to allowed for SCHOOL)
  canAddStudent: (params: {
    currentStudents: number;
    pendingInvites?: number;
    // When caps are unlimited, we allow existing seat behavior to govern.
    organization?: Pick<Organization, 'numOfStudentSeats'>;
  }) => boolean;
  canCreateClass: (params: { currentActiveClasses: number }) => boolean;
  canCreateAssignmentOfKind: (params: {
    kind: string | null | undefined;
    createdCount: number;
  }) => boolean;
  assignmentQuotaForKind: (
    kind: string | null | undefined
  ) => number | null;
};

function assignmentQuotaForFreeKind(kind: string | null | undefined) {
  if (!kind) return null;
  return (
    FREE_CLASSROOM_ASSIGNMENT_QUOTAS[
      kind as FreeClassroomAssignmentQuotaKind
    ] ?? null
  );
}

export function canCreateAssignmentOfKindForPlan(
  plan: OrganizationPlan,
  params: { kind: string | null | undefined; createdCount: number }
) {
  if (plan !== 'FREE_CLASSROOM') return true;
  const cap = assignmentQuotaForFreeKind(params.kind);
  if (cap == null) return false;
  return params.createdCount < cap;
}

export function getEntitlementsForPlan(plan: OrganizationPlan): PlanEntitlements {
  if (plan === 'FREE_CLASSROOM') {
    return {
      plan,
      studentSeatCap: FREE_CLASSROOM_STUDENT_SEAT_CAP,
      teacherSeatCap: FREE_CLASSROOM_TEACHER_SEAT_CAP,
      activeClassCap: FREE_CLASSROOM_ACTIVE_CLASS_CAP,
      features: {
        reporter: false, // spec §5.1 Reporter is gated in free tier
        classInsights: true,
        lessonPlanQuota: FREE_CLASSROOM_LESSON_PLAN_QUOTA,
      },
      canAddStudent: ({ currentStudents, pendingInvites = 0 }) =>
        currentStudents + pendingInvites < FREE_CLASSROOM_STUDENT_SEAT_CAP,
      canCreateClass: ({ currentActiveClasses }) =>
        currentActiveClasses < FREE_CLASSROOM_ACTIVE_CLASS_CAP,
      canCreateAssignmentOfKind: ({ kind, createdCount }) =>
        canCreateAssignmentOfKindForPlan('FREE_CLASSROOM', {
          kind,
          createdCount,
        }),
      assignmentQuotaForKind: (kind) => assignmentQuotaForFreeKind(kind),
    };
  }

  // SCHOOL and all other plans: preserve current behavior (unlimited here).
  return {
    plan,
    studentSeatCap: null,
    teacherSeatCap: null,
    activeClassCap: null,
    features: {
      reporter: true,
      classInsights: true,
      lessonPlanQuota: null,
    },
    canAddStudent: () => true,
    canCreateClass: () => true,
    canCreateAssignmentOfKind: () => true,
    assignmentQuotaForKind: () => null,
  };
}

export function canAddStudentForOrganization(
  organization: Pick<Organization, 'plan' | 'numOfStudentSeats'>,
  params: { currentStudents: number; pendingInvites?: number }
) {
  return getEntitlements(organization).canAddStudent({
    ...params,
    organization,
  });
}

export function getEntitlements(
  orgOrPlan: Pick<Organization, 'plan'> | OrganizationPlan
): PlanEntitlements {
  const plan =
    typeof orgOrPlan === 'string'
      ? (orgOrPlan as OrganizationPlan)
      : orgOrPlan.plan;
  return getEntitlementsForPlan(plan);
}

