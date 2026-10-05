import type { Organization, OrganizationPlan } from '@app/prisma';

// Spec §5.3: one primitive — Organization.plan — decides entitlements.
// Default SCHOOL plan must short-circuit every check to preserve current behavior.

export const FREE_CLASSROOM_STUDENT_SEAT_CAP = 35;
export const FREE_CLASSROOM_TEACHER_SEAT_CAP = 1;
export const FREE_CLASSROOM_ACTIVE_CLASS_CAP = 1;
// TODO(spec 5.1): Brian said "around 3–4" lesson plans; start with 4 and confirm.
export const FREE_CLASSROOM_LESSON_PLAN_QUOTA = 4;

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
};

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
  };
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

