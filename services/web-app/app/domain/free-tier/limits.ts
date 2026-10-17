/** Defaults remain available to existing entitlement callers during rollout. */
export const DEFAULT_FREE_TIER_LIMITS = {
  studentSeatCap: 35,
  lessonPlannerMonthly: 5,
  reporterMonthly: 2,
} as const;

export type FreeTierLimits = { [K in keyof typeof DEFAULT_FREE_TIER_LIMITS]: number };
export const FREE_TIER_LIMIT_BOUNDS = {
  studentSeatCap: [1, 200],
  lessonPlannerMonthly: [0, 100],
  reporterMonthly: [0, 100],
} as const;

// Compatibility exports for consumers that still require rollout defaults.
export const FREE_CLASSROOM_STUDENT_SEAT_CAP = DEFAULT_FREE_TIER_LIMITS.studentSeatCap;
export const FREE_CLASSROOM_LESSON_PLAN_QUOTA = DEFAULT_FREE_TIER_LIMITS.lessonPlannerMonthly;
