import { FREE_TIER_LIMIT_BOUNDS, type FreeTierLimits } from './limits';

export type MonthlyQuotaLimitField = 'lessonPlannerMonthly' | 'reporterMonthly';

/**
 * Whether P8 monthly reservations apply for this configured cap.
 *
 * - `0` still enforces (blocks new counted operations).
 * - The inclusive upper bound (`100` today) means "no practical cap" for demo /
 *   intern windows where operators max out limits via Internal.
 */
export function monthlyQuotaCapEnforcesNewUsage(
  cap: number,
  field: MonthlyQuotaLimitField
): boolean {
  const [, max] = FREE_TIER_LIMIT_BOUNDS[field];
  return cap > 0 && cap < max;
}

export function reporterMonthlyQuotaEnforced(limits: FreeTierLimits): boolean {
  return monthlyQuotaCapEnforcesNewUsage(
    limits.reporterMonthly,
    'reporterMonthly'
  );
}

export function lessonPlannerMonthlyQuotaEnforced(
  limits: FreeTierLimits
): boolean {
  return monthlyQuotaCapEnforcesNewUsage(
    limits.lessonPlannerMonthly,
    'lessonPlannerMonthly'
  );
}
